use std::borrow::Cow;
use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::process::Command;
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::Duration;

use russh::client;
use russh::keys::key::PrivateKeyWithHashAlg;
use russh::keys::load_secret_key;
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
    pub app: Option<AppHandle>,
    pub host: String,
    pub port: u16,
    /// 是否进行交互式 host key 校验（连接测试等场景为 false，直接接受）
    pub interactive: bool,
}

impl ClientHandler {
    pub fn new(app: AppHandle, host: String, port: u16, interactive: bool) -> Self {
        Self {
            app: Some(app),
            host,
            port,
            interactive,
        }
    }
}

#[async_trait::async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // 非交互场景（如连接测试）直接接受，不弹窗
        if !self.interactive {
            return Ok(true);
        }

        let key_str = server_public_key.to_string();
        let fingerprint = server_public_key
            .fingerprint(ssh_key::HashAlg::Sha256)
            .to_string();
        let host = self.host.clone();
        let port = self.port;
        let app = match &self.app {
            Some(a) => a,
            None => return Ok(true),
        };

        // 1) 已知且匹配 → 直接通过
        if let hostkey::KnownStatus::Trusted =
            hostkey::check(app, &host, port, &key_str)
        {
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

        match decision {
            HostKeyDecision::AcceptAndSave => {
                let _ = hostkey::add(app, &host, port, &key_str);
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
#[derive(Debug, Clone, serde::Deserialize)]
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
    pub status_tx: mpsc::UnboundedSender<SessionStatusInfo>,
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

/// 用全 0 覆盖文件内容，避免解密后的私钥明文残留在磁盘（删除前的兜底）
fn zeroize_file(path: &std::path::Path) {
    if let Ok(meta) = std::fs::metadata(path) {
        let len = meta.len();
        if len == 0 {
            return;
        }
        if let Ok(mut f) = std::fs::OpenOptions::new().write(true).open(path) {
            let zeros = [0u8; 4096];
            let mut written = 0u64;
            while written < len {
                let chunk = std::cmp::min(4096, (len - written) as usize);
                if f.write_all(&zeros[..chunk]).is_err() {
                    break;
                }
                written += chunk as u64;
            }
            let _ = f.flush();
        }
    }
}

/// 加载私钥：优先用 russh 直接加载（OpenSSH / PKCS#8 / 无加密 PEM）；
/// 若失败且文件是 OpenSSL 老式加密 PEM（`Proc-Type: 4,ENCRYPTED`），
/// 回退到系统 `openssl` 命令解密到临时文件后再加载。
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
        Ok(key) => return Ok(key),
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

            // 3) 用系统 openssl 解密到临时文件
            let tmp_path = std::env::temp_dir().join(format!(
                "ssheasy_key_{}.pem",
                uuid::Uuid::new_v4().simple()
            ));

            let output = Command::new("openssl")
                .arg("pkey")
                .arg("-in")
                .arg(&expanded)
                .arg("-out")
                .arg(&tmp_path)
                .arg("-passin")
                .arg("env:SSHEASY_KEY_PASS")
                .env("SSHEASY_KEY_PASS", pass)
                .output()
                .map_err(|e| format!("调用 openssl 失败（系统是否安装 openssl?）: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                // 清理可能产生的临时文件（先清零再删）
                zeroize_file(&tmp_path);
                let _ = std::fs::remove_file(&tmp_path);
                return Err(if stderr.contains("bad decrypt") || stderr.contains("Could not read")
                {
                    "密钥密码不正确，无法解密私钥。".into()
                } else {
                    format!("openssl 解密私钥失败: {}", stderr.trim())
                });
            }

            // 解密后的文件仅属主可读写
            #[cfg(unix)]
            let _ = std::fs::set_permissions(&tmp_path, std::fs::Permissions::from_mode(0o600));

            // 4) 加载已解密的临时密钥（无密码）
            let result = load_secret_key(&tmp_path, None);

            // 5) 先覆盖临时文件内容（清零解密后的私钥明文），再删除
            zeroize_file(&tmp_path);
            let _ = std::fs::remove_file(&tmp_path);

            result.map_err(|e| format!("解密后的私钥仍无法解析: {}", e))
        }
    }
}

/// 建立 SSH 连接并启动 I/O 循环
/// 返回 SessionHandle 用于后续交互
/// output_tx 为原始字节透传通道（xterm.js 原生吃 Uint8Array，避免多字节字符被截断乱码）
pub async fn connect(
    app: AppHandle,
    session_id: String,
    server_id: String,
    config: &ConnectConfig,
    output_tx: mpsc::UnboundedSender<Vec<u8>>,
    interactive: bool,
) -> Result<SessionHandle, error_translate::TranslatedError> {
    let ssh_config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(60)),
        // 真实存活探测：russh 周期性发 SSH 级 keepalive，连续超时后由 channel.wait() 暴露断线
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        preferred: legacy_preferred(),
        ..<_>::default()
    });

    let addr = format!("{}:{}", config.host, config.port);

    // 提前克隆 AppHandle 供 I/O 循环退出时 emit 断线事件（下方 app 会被 ClientHandler 拿走所有权）
    let io_app = app.clone();

    // 建立 TCP + SSH 连接
    let mut handle = client::connect(
        ssh_config,
        &addr,
        ClientHandler::new(app, config.host.clone(), config.port, interactive),
    )
    .await
    .map_err(|e| error_translate::translate(&e.to_string(), &config.host, config.port))?;

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
            let key_pair = load_key_with_legacy_fallback(key_path, passphrase).map_err(|e| {
                error_translate::translate(&e, &config.host, config.port)
            })?;
            let key_with_hash =
                PrivateKeyWithHashAlg::new(Arc::new(key_pair), None).map_err(|e| {
                    error_translate::translate(&e.to_string(), &config.host, config.port)
                })?;
            handle
                .authenticate_publickey(&config.username, key_with_hash)
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

    if !auth_ok {
        return Err(error_translate::TranslatedError {
            code: error_translate::ErrorCode::AuthFailedPassword,
            human_msg: "认证失败".into(),
            detail: "用户名或凭据不正确".into(),
            suggestions: vec![
                "确认用户名和密码/密钥是否正确".into(),
                "检查服务器是否允许该用户登录".into(),
            ],
        });
    }

    // 打开 shell channel
    let mut channel = handle.channel_open_session().await.map_err(|e| {
        error_translate::translate(&e.to_string(), &config.host, config.port)
    })?;

    channel
        .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
        .await
        .map_err(|e| error_translate::translate(&e.to_string(), &config.host, config.port))?;

    channel
        .request_shell(false)
        .await
        .map_err(|e| error_translate::translate(&e.to_string(), &config.host, config.port))?;

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
    tokio::spawn(async move {
        loop {
            tokio::select! {
                // 显式关闭信号
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
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
        // 会话结束（显式关闭 或 网络断开/keepalive 超时），通知前端并真正断开 SSH
        let _ = io_app.emit(
            events::CONNECTION_STATUS,
            serde_json::json!({
                "sessionId": io_sid,
                "status": "disconnected",
                "message": "连接已断开"
            }),
        );
        let _ = client.lock().await.disconnect(Disconnect::ByApplication, "session ended", "en").await;
    });

    Ok(SessionHandle {
        session_id,
        server_id,
        client: client_for_session,
        input_tx,
        resize_tx,
        status,
        status_tx,
        status_rx: Some(status_rx),
        shutdown: shutdown_tx,
    })
}

/// 状态解析用的正则（热路径，编译一次复用，避免每条输出都重建）
static RE_CWD: LazyLock<regex::Regex> = LazyLock::new(|| {
    // 匹配形如：` /var/log`（末尾空格 + 斜杠路径 + 空格/行尾），也兼容 `~` 家目录显示
    regex::Regex::new(r#"(?:^|[\r\n])\s+((?:/|~)[^\s$#]*[^\s$#/]?)\s*[\r\n]?$"#).unwrap()
});
static RE_USERHOST: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"([\w.-]+)@([\w.-]+):").unwrap()
});

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
