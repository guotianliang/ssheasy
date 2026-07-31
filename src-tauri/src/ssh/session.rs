use std::borrow::Cow;
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use russh::client;
use russh::keys::key::PrivateKeyWithHashAlg;
use russh::keys::load_secret_key;
use russh::Preferred;
use russh::{kex, ChannelMsg, Disconnect};
use tokio::sync::mpsc;

use super::error_translate;

/// 构建兼容老服务器的算法配置（在默认列表末尾追加 legacy 算法）
fn legacy_preferred() -> Preferred {
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
struct ClientHandler;

#[async_trait::async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Phase 1: 接受所有 host key，后续做 known_hosts 校验
        Ok(true)
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

/// 活跃会话句柄：通过 mpsc 发送输入
pub struct SessionHandle {
    pub session_id: String,
    pub server_id: String,
    pub input_tx: mpsc::UnboundedSender<Vec<u8>>,
    pub resize_tx: mpsc::UnboundedSender<(u32, u32)>,
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
/// 回退到系统 `openssl` 命令解密到临时文件后再加载。
fn load_key_with_legacy_fallback(
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
                // 清理可能产生的空文件
                let _ = std::fs::remove_file(&tmp_path);
                return Err(if stderr.contains("bad decrypt") || stderr.contains("Could not read")
                {
                    "密钥密码不正确，无法解密私钥。".into()
                } else {
                    format!("openssl 解密私钥失败: {}", stderr.trim())
                });
            }

            // 4) 加载已解密的临时密钥（无密码）
            let result = load_secret_key(&tmp_path, None);

            // 5) 立即清理临时文件（无论成功失败）
            let _ = std::fs::remove_file(&tmp_path);

            result.map_err(|e| format!("解密后的私钥仍无法解析: {}", e))
        }
    }
}

/// 建立 SSH 连接并启动 I/O 循环
/// 返回 SessionHandle 用于后续交互
pub async fn connect(
    session_id: String,
    server_id: String,
    config: &ConnectConfig,
    output_tx: mpsc::UnboundedSender<String>,
) -> Result<SessionHandle, error_translate::TranslatedError> {
    let ssh_config = Arc::new(client::Config {
        inactivity_timeout: Some(Duration::from_secs(60)),
        preferred: legacy_preferred(),
        ..<_>::default()
    });

    let addr = format!("{}:{}", config.host, config.port);

    // 建立 TCP + SSH 连接
    let mut handle = client::connect(ssh_config, &addr, ClientHandler)
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

    // 创建输入/resize 通道
    let (input_tx, mut input_rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let (resize_tx, mut resize_rx) = mpsc::unbounded_channel::<(u32, u32)>();

    // 启动 I/O 循环 task
    tokio::spawn(async move {
        loop {
            tokio::select! {
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
                            let text = String::from_utf8_lossy(&data).to_string();
                            if output_tx.send(text).is_err() {
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
        // 会话结束，断开连接
        let _ = handle.disconnect(Disconnect::ByApplication, "session ended", "en").await;
    });

    Ok(SessionHandle {
        session_id,
        server_id,
        input_tx,
        resize_tx,
    })
}
