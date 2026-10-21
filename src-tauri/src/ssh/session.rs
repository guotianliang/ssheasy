use std::borrow::Cow;
use std::process::Command;
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::Duration;

use russh::client;
use russh::keys::key::PrivateKeyWithHashAlg;
use russh::keys::{decode_secret_key, load_secret_key};
use russh::Preferred;
use russh::{kex, ChannelMsg, Disconnect};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, watch, Mutex};

use super::error_translate;
use crate::events;
use crate::ssh::hostkey::{self, HostKeyDecision};

/// 终端状态栏信息（user@host:路径）
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatusInfo {
    pub user: String,
    pub host: String,
    pub cwd: String,
}

/// 构建兼容老服务器的算法配置（在默认列表末尾追加 legacy 算法）
pub fn legacy_preferred() -> Preferred {
    let mut default_kex: Vec<kex::Name> = Preferred::DEFAULT.kex.to_vec();
    // 追加老服务器常用的 KEX 算法
    default_kex.push(kex::DH_G14_SHA1);
    default_kex.push(kex::DH_G1_SHA1);

    Preferred {
        kex: Cow::Owned(default_kex),
        // key 列表默认已包含 Rsa { hash: None } 即 ssh-rsa，无需修改
        ..Preferred::DEFAULT
    }
}

/// SSH 客户端 Handler
pub struct ClientHandler {
    pub app: AppHandle,
    pub host: String,
    pub port: u16,
}

impl ClientHandler {
    pub fn new(app: AppHandle, host: String, port: u16) -> Self {
        Self { app, host, port }
    }
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        if server_public_key.certificate().is_some() {
            return Err(russh::Error::from(std::io::Error::other(
                "当前版本不支持 SSH 主机证书，请使用主机公钥",
            )));
        }
        let server_public_key = server_public_key.public_key();
        let key_str = server_public_key
            .to_openssh()
            .map_err(|e| russh::Error::from(std::io::Error::other(e.to_string())))?;
        let fingerprint = server_public_key
            .fingerprint(russh::keys::HashAlg::Sha256)
            .to_string();
        let host = self.host.clone();
        let port = self.port;
        let app = &self.app;

        // 1) 已知且匹配 → 直接通过
        if let hostkey::KnownStatus::Trusted = hostkey::check(app, &host, port, &key_str) {
            return Ok(true);
        }

        let action = match hostkey::check(app, &host, port, &key_str) {
            hostkey::KnownStatus::Changed => "changed",
            _ => "new",
        };

        // 2) 询问前端：生成一次性 token，等待用户决策
        let (tx, rx) = tokio::sync::oneshot::channel::<HostKeyDecision>();
        let token = uuid::Uuid::new_v4().to_string();

        if let Some(state) = app.try_state::<crate::AppState>() {
            state.hostkey_pending.lock().await.insert(token.clone(), tx);
            let _ = app.emit(
                events::HOSTKEY_VERIFY,
                serde_json::json!({
                    "token": token,
                    "host": host,
                    "port": port,
                    "fingerprint": fingerprint,
                    "action": action,
                }),
            );
        }

        // 3) 等待决策（60s 超时 → 视为拒绝）
        let decision = match tokio::time::timeout(Duration::from_secs(60), rx).await {
            Ok(Ok(d)) => d,
            _ => HostKeyDecision::Reject,
        };

        if let Some(state) = app.try_state::<crate::AppState>() {
            state.hostkey_pending.lock().await.remove(&token);
        }

        match decision {
            HostKeyDecision::AcceptAndSave => {
                hostkey::add(app, &host, port, &key_str).map_err(russh::Error::from)?;
                Ok(true)
            }
            HostKeyDecision::AcceptOnce => Ok(true),
            HostKeyDecision::Reject => Err(russh::Error::from(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "未信任该服务器的 SSH 指纹，连接已取消",
            ))),
        }
    }
}

/// 连接配置（从前端传入）
#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String, // "password" | "key"
    pub password: Option<String>,
    pub key_path: Option<String>,
    /// 加密私钥的解密密码（仅 auth_type = "key" 时使用）
    pub key_passphrase: Option<String>,
}

/// 从已存储的 Server 记录构建 ConnectConfig，凭据从 Keychain 读取。
/// terminal 与 sftp 连接共用此逻辑，避免重复。
pub fn build_config_from_server(
    server: &crate::storage::server_repo::Server,
) -> Result<ConnectConfig, String> {
    let (password, key_passphrase) = if server.auth_type == "password" {
        let pwd = crate::secret::keychain::get_password(&server.id)?;
        (pwd, None)
    } else {
        let pass = crate::secret::keychain::get_key_passphrase(&server.id)?;
        (None, pass)
    };

    Ok(ConnectConfig {
        host: server.host.clone(),
        port: server.port,
        username: server.username.clone(),
        auth_type: server.auth_type.clone(),
        password,
        key_path: server.key_path.clone(),
        key_passphrase,
    })
}

/// 活跃会话句柄：通过 mpsc 发送输入
pub struct SessionHandle {
    pub alive: Arc<std::sync::atomic::AtomicBool>,
    pub session_id: String,
    pub server_id: String,
    /// 底层 russh 客户端句柄（共享，供 SFTP 复用同一条 SSH 连接）。
    /// 注意 client::Handle 不可 Clone，故用 Arc<Mutex> 共享；I/O 循环仅结尾 disconnect 时加锁。
    pub client: Arc<tokio::sync::Mutex<client::Handle<ClientHandler>>>,
    pub input_tx: mpsc::UnboundedSender<Vec<u8>>,
    pub resize_tx: mpsc::UnboundedSender<(u32, u32)>,
    /// 状态栏信息（user@host:路径），由 I/O task 监听输出更新
    pub status: Arc<tokio::sync::Mutex<SessionStatusInfo>>,
    /// 状态栏变化通知通道（receiver 由 manager 持有并转发到前端）
    pub status_rx: Option<mpsc::UnboundedReceiver<SessionStatusInfo>>,
    /// 关断信号：close_session 发送 true 后，I/O 循环据此退出并真正断开 SSH
    pub shutdown: watch::Sender<bool>,
}

impl SessionHandle {
    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        self.input_tx
            .send(data.to_vec())
            .map_err(|_| "session closed".to_string())
    }

    pub fn resize(&self, cols: u32, rows: u32) -> Result<(), String> {
        self.resize_tx
            .send((cols, rows))
            .map_err(|_| "session closed".to_string())
    }
}

/// 加载私钥：优先用 russh 直接加载（OpenSSH / PKCS#8 / 无加密 PEM）；
/// 若失败且文件是 OpenSSL 老式加密 PEM（`Proc-Type: 4,ENCRYPTED`），
/// 回退到系统 `openssl` 命令解密到内存后加载。
pub fn load_key_with_legacy_fallback(
    key_path: &str,
    passphrase: Option<&str>,
) -> Result<russh::keys::PrivateKey, String> {
    // 展开 ~ 路径
    let expanded = if let Some(rest) = key_path.strip_prefix("~/") {
        match std::env::var("HOME") {
            Ok(home) => format!("{}/{}", home, rest),
            Err(_) => key_path.to_string(),
        }
    } else {
        key_path.to_string()
    };

    // 1) 直接尝试
    match load_secret_key(&expanded, passphrase) {
        Ok(key) => Ok(key),
        Err(direct_err) => {
            // 2) 检查是否是 legacy 加密 PEM
            let content = std::fs::read_to_string(&expanded)
                .map_err(|e| format!("读取私钥文件失败: {}", e))?;

            if !content.contains("Proc-Type: 4,ENCRYPTED") {
                // 不是 legacy 格式，原样返回 russh 的错误
                return Err(format!("私钥加载失败: {}", direct_err));
            }

            let pass = passphrase.unwrap_or("");
            if pass.is_empty() {
                return Err(
                    "该私钥已加密，但未提供密钥密码。请在添加服务器时填写「密钥密码」。".into(),
                );
            }

            // 3) 用系统 openssl 解密：输出到 stdout（内存），不写中间文件。
            //    失败时 openssl 不会产出任何文件，故失败路径完全不落盘。
            let output = Command::new("openssl")
                .arg("pkey")
                .arg("-in")
                .arg(&expanded)
                .arg("-passin")
                .arg("env:SSHEASY_KEY_PASS")
                .env("SSHEASY_KEY_PASS", pass)
                .output()
                .map_err(|e| format!("调用 openssl 失败（系统是否安装 openssl?）: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(
                    if stderr.contains("bad decrypt") || stderr.contains("Could not read") {
                        "密钥密码不正确，无法解密私钥。".into()
                    } else {
                        format!("openssl 解密私钥失败: {}", stderr.trim())
                    },
                );
            }

            // 已有依赖支持从内存解析，无需创建明文临时文件。
            let decrypted = String::from_utf8(output.stdout)
                .map_err(|_| "openssl 输出不是有效的 PEM".to_string())?;
            decode_secret_key(&decrypted, None).map_err(|e| format!("解密后的私钥仍无法解析: {e}"))
        }
    }
}

/// Authenticate a private key using the server's RSA signature capabilities.
pub async fn authenticate_private_key<H: client::Handler>(
    handle: &mut client::Handle<H>,
    username: &str,
    key: russh::keys::PrivateKey,
) -> Result<client::AuthResult, russh::Error> {
    let hash = if key.algorithm().is_rsa() {
        // Servers predating server-sig-algs (e.g. OpenSSH 5.3) need ssh-rsa.
        // Preserve the strongest advertised SHA-2 choice for modern servers.
        handle.best_supported_rsa_hash().await?.flatten()
    } else {
        None
    };
    handle
        .authenticate_publickey(username, PrivateKeyWithHashAlg::new(Arc::new(key), hash))
        .await
}

/// 建立 SSH 连接并启动 I/O 循环，返回 SessionHandle 用于后续交互。
/// output_tx 为原始字节透传通道（xterm.js 原生吃 Uint8Array）。
pub async fn connect(
    app: AppHandle,
    session_id: String,
    server_id: String,
    config: &ConnectConfig,
    output_tx: mpsc::UnboundedSender<Vec<u8>>,
) -> Result<SessionHandle, error_translate::TranslatedError> {
    let ssh_config = Arc::new(client::Config {
        inactivity_timeout: None,
        // 真实存活探测：russh 周期性发 SSH 级 keepalive，连续超时后由 channel.wait() 暴露断线
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        preferred: legacy_preferred(),
        ..<_>::default()
    });

    let tcp = tokio::time::timeout(
        Duration::from_secs(12),
        tokio::net::TcpStream::connect((config.host.as_str(), config.port)),
    )
    .await
    .map_err(|_| error_translate::translate("connection timed out", &config.host, config.port))?
    .map_err(|e| error_translate::translate(&e.to_string(), &config.host, config.port))?;

    // 提前克隆 AppHandle 供 I/O 循环退出时 emit 断线事件（下方 app 会被 ClientHandler 拿走所有权）
    let io_app = app.clone();

    // 建立 TCP + SSH 连接
    let mut handle = tokio::time::timeout(
        Duration::from_secs(75),
        client::connect_stream(
            ssh_config,
            tcp,
            ClientHandler::new(app, config.host.clone(), config.port),
        ),
    )
    .await
    .map_err(|_| error_translate::translate("SSH handshake timed out", &config.host, config.port))?
    .map_err(|e| error_translate::translate(&e.to_string(), &config.host, config.port))?;

    // 认证和 shell 初始化也有期限，防止服务器握手后不再响应。
    let mut channel = tokio::time::timeout(Duration::from_secs(45), async {
        // 认证
        let auth_ok = match config.auth_type.as_str() {
            "password" => {
                let pwd = config.password.as_deref().unwrap_or("");
                handle
                    .authenticate_password(&config.username, pwd)
                    .await
                    .map_err(|e| {
                        error_translate::translate(&e.to_string(), &config.host, config.port)
                    })?
            }
            "key" => {
                let key_path = config.key_path.as_deref().unwrap_or("");
                let passphrase = config.key_passphrase.as_deref();
                let key_pair = load_key_with_legacy_fallback(key_path, passphrase)
                    .map_err(|e| error_translate::translate(&e, &config.host, config.port))?;
                authenticate_private_key(&mut handle, &config.username, key_pair)
                    .await
                    .map_err(|e| {
                        error_translate::translate(&e.to_string(), &config.host, config.port)
                    })?
            }
            _ => {
                return Err(error_translate::TranslatedError {
                    code: error_translate::ErrorCode::Unknown,
                    human_msg: "不支持的认证方式".into(),
                    detail: format!("auth_type: {}", config.auth_type),
                    suggestions: vec!["支持 password 或 key".into()],
                })
            }
        };

        if !auth_ok.success() {
            let key_auth = config.auth_type == "key";
            return Err(error_translate::TranslatedError {
                code: if key_auth {
                    error_translate::ErrorCode::AuthFailedKey
                } else {
                    error_translate::ErrorCode::AuthFailedPassword
                },
                human_msg: if key_auth {
                    "密钥认证失败"
                } else {
                    "密码认证失败"
                }
                .into(),
                detail: "服务器未接受当前用户的认证请求".into(),
                suggestions: if key_auth {
                    vec![
                        "核对用户名与所选私钥文件是否和终端命令一致".into(),
                        "检查服务器是否为该用户配置了对应公钥".into(),
                    ]
                } else {
                    vec![
                        "确认用户名和密码是否正确".into(),
                        "检查服务器是否允许该用户使用密码登录".into(),
                    ]
                },
            });
        }

        // 打开 shell channel
        let channel = handle
            .channel_open_session()
            .await
            .map_err(|e| error_translate::translate(&e.to_string(), &config.host, config.port))?;

        channel
            .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
            .await
            .map_err(|e| error_translate::translate(&e.to_string(), &config.host, config.port))?;

        channel
            .request_shell(false)
            .await
            .map_err(|e| error_translate::translate(&e.to_string(), &config.host, config.port))?;

        Ok::<_, error_translate::TranslatedError>(channel)
    })
    .await
    .map_err(|_| {
        error_translate::translate("SSH authentication timed out", &config.host, config.port)
    })??;

    // 将底层 client::Handle 放入共享 Arc<Mutex>，供 SFTP 复用同一条 SSH 连接
    let client = Arc::new(Mutex::new(handle));
    let client_for_session = client.clone();

    // 创建输入/resize 通道
    let (input_tx, mut input_rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let (resize_tx, mut resize_rx) = mpsc::unbounded_channel::<(u32, u32)>();

    // 状态栏跟踪：解析 shell 输出中的提示符/路径
    let status = Arc::new(tokio::sync::Mutex::new(SessionStatusInfo {
        user: config.username.clone(),
        host: config.host.clone(),
        cwd: String::new(),
    }));
    let (status_tx, status_rx) = mpsc::unbounded_channel::<SessionStatusInfo>();

    // 关断信号通道：close_session 发送 true，I/O 循环据此退出并真正断开 SSH
    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);

    // 启动 I/O 循环 task
    let io_status = status.clone();
    let io_status_tx = status_tx.clone();
    let io_sid = session_id.clone();
    let io_server_id = server_id.clone();
    let alive = Arc::new(std::sync::atomic::AtomicBool::new(true));
    let io_alive = alive.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                // 显式关闭信号
                changed = shutdown_rx.changed() => {
                    if changed.is_err() || *shutdown_rx.borrow() {
                        break;
                    }
                }
                // 用户输入
                Some(data) = input_rx.recv() => {
                    if channel.data(&data[..]).await.is_err() {
                        break;
                    }
                }
                // 终端 resize
                Some((cols, rows)) = resize_rx.recv() => {
                    let _ = channel.window_change(cols, rows, 0, 0).await;
                }
                // 服务器输出
                msg = channel.wait() => {
                    match msg {
                        Some(ChannelMsg::Data { data }) => {
                            // 状态解析：从输出中提取 user@host 提示符和 cwd
                            // （仅对可解码部分解析，不影响原始字节透传）
                            let text = String::from_utf8_lossy(&data).to_string();
                            let mut info = io_status.lock().await;
                            let mut changed = false;

                            // 1) 解析 cwd：形如  path$
                            if let Some(path) = extract_cwd(&text) {
                                info.cwd = path;
                                changed = true;
                            }
                            // 2) 解析 user@host
                            if let Some((u, h)) = extract_userhost(&text) {
                                if u != info.user || h != info.host {
                                    info.user = u;
                                    info.host = h;
                                    changed = true;
                                }
                            }

                            if changed {
                                // 推送状态栏变化（克隆发送，避免持锁）
                                let snapshot = SessionStatusInfo {
                                    user: info.user.clone(),
                                    host: info.host.clone(),
                                    cwd: info.cwd.clone(),
                                };
                                drop(info);
                                if io_status_tx.send(snapshot).is_err() {
                                    // 接收端已关闭，忽略
                                }
                            } else {
                                drop(info);
                            }

                            // 原始字节透传：避免 UTF-8 多字节字符被 SSH 分包截断导致乱码
                            if output_tx.send(data.to_vec()).is_err() {
                                break;
                            }
                        }
                        Some(ChannelMsg::ExitStatus { .. }) | Some(ChannelMsg::Close) | None => {
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }
        io_alive.store(false, std::sync::atomic::Ordering::Release);
        // 先从连接池移除再通知界面，避免快速退出的 shell 被重新标成在线。
        if let Some(state) = io_app.try_state::<crate::AppState>() {
            state.ssh_manager.remove_finished(&io_sid).await;
            state
                .sftp_manager
                .close_for_session(&io_server_id, &io_sid)
                .await;
        }
        let _ = io_app.emit(
            events::CONNECTION_STATUS,
            serde_json::json!({
                "serverId": io_server_id, "sessionId": io_sid,
                "status": "disconnected", "message": "连接已断开"
            }),
        );
        let _ = client
            .lock()
            .await
            .disconnect(Disconnect::ByApplication, "session ended", "en")
            .await;
    });

    Ok(SessionHandle {
        alive,
        session_id,
        server_id,
        client: client_for_session,
        input_tx,
        resize_tx,
        status,
        status_rx: Some(status_rx),
        shutdown: shutdown_tx,
    })
}

/// 状态解析用的正则（热路径，编译一次复用，避免每条输出都重建）
static RE_CWD: LazyLock<regex::Regex> = LazyLock::new(|| {
    // 匹配形如：` /var/log`（末尾空格 + 斜杠路径 + 空格/行尾），也兼容 `~` 家目录显示
    regex::Regex::new(r#"(?:^|[\r\n])\s+((?:/|~)[^\s$#]*[^\s$#/]?)\s*[\r\n]?$"#).unwrap()
});
static RE_USERHOST: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"([\w.-]+)@([\w.-]+):").unwrap());

/// 从输出中提取 cwd：匹配形如  /path/to/dir 的路径
fn extract_cwd(text: &str) -> Option<String> {
    if let Some(cap) = RE_CWD.captures(text) {
        let path = cap.get(1).unwrap().as_str().trim();
        if path.len() > 1 {
            return Some(path.to_string());
        }
    }
    None
}

/// 从输出中提取 user@host：匹配形如  user@host:~$ 的提示符
fn extract_userhost(text: &str) -> Option<(String, String)> {
    if let Some(cap) = RE_USERHOST.captures(text) {
        let user = cap.get(1).unwrap().as_str().to_string();
        let host = cap.get(2).unwrap().as_str().to_string();
        if user == "root" || user == "user" || !user.is_empty() {
            return Some((user, host));
        }
    }
    None
}
