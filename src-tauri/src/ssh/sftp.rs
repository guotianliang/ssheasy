use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};
use std::path::Path as StdPath;

use tokio::io::AsyncReadExt;

use russh::client;
use russh::keys::key::PrivateKeyWithHashAlg;
use russh_sftp::client::SftpSession;
use serde::Serialize;
use tauri::AppHandle;

use super::session::{legacy_preferred, load_key_with_legacy_fallback, ClientHandler, ConnectConfig};

/// 文件条目（返回给前端）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    /// 格式化后的修改时间，如 "2026-08-01 12:30"
    pub modified: String,
}

/// SFTP 连接池：按 server_id 缓存会话，懒加载
pub struct SftpManager {
    app: AppHandle,
    sessions: HashMap<String, Arc<SftpSession>>,
}

impl SftpManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            sessions: HashMap::new(),
        }
    }

    /// 获取（或建立）某服务器的 SFTP 会话
    pub async fn session(
        &mut self,
        server_id: &str,
        config: &ConnectConfig,
    ) -> Result<Arc<SftpSession>, String> {
        if let Some(existing) = self.sessions.get(server_id) {
            return Ok(existing.clone());
        }

        let sftp = Self::connect(self.app.clone(), config).await?;
        let arc = Arc::new(sftp);
        self.sessions.insert(server_id.to_string(), arc.clone());
        Ok(arc)
    }

    /// 关闭并移除某服务器的 SFTP 会话
    pub async fn close(&mut self, server_id: &str) {
        if let Some(sftp) = self.sessions.remove(server_id) {
            let _ = sftp.close().await;
        }
    }

    /// 建立一条独立的 SSH 连接并打开 sftp 子系统
    async fn connect(app: AppHandle, config: &ConnectConfig) -> Result<SftpSession, String> {
        let ssh_config = Arc::new(client::Config {
            inactivity_timeout: Some(Duration::from_secs(120)),
            preferred: legacy_preferred(),
            ..<_>::default()
        });

        let addr = format!("{}:{}", config.host, config.port);
        let mut handle = client::connect(
            ssh_config,
            &addr,
            ClientHandler::new(app, config.host.clone(), config.port, true),
        )
        .await
        .map_err(|e| format!("连接失败: {}", e))?;

        // 认证（与 shell 连接逻辑一致）
        let auth_ok = match config.auth_type.as_str() {
            "password" => {
                let pwd = config.password.as_deref().unwrap_or("");
                handle
                    .authenticate_password(&config.username, pwd)
                    .await
                    .map_err(|e| format!("认证失败: {}", e))?
            }
            "key" => {
                let key_path = config.key_path.as_deref().unwrap_or("");
                let key_pair =
                    load_key_with_legacy_fallback(key_path, config.key_passphrase.as_deref())?;
                let key_with_hash = PrivateKeyWithHashAlg::new(Arc::new(key_pair), None)
                    .map_err(|e| format!("密钥处理失败: {}", e))?;
                handle
                    .authenticate_publickey(&config.username, key_with_hash)
                    .await
                    .map_err(|e| format!("认证失败: {}", e))?
            }
            _ => return Err("不支持的认证方式".into()),
        };

        if !auth_ok {
            return Err("认证失败：用户名或凭据不正确".into());
        }

        // 打开 sftp 子系统 channel
        let channel = handle
            .channel_open_session()
            .await
            .map_err(|e| format!("打开会话通道失败: {}", e))?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| format!("请求 sftp 子系统失败（服务器可能未启用 SFTP）: {}", e))?;

        SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| format!("初始化 SFTP 会话失败: {}", e))
    }
}

/// 列出目录内容
pub async fn list_dir(sftp: &SftpSession, path: &str) -> Result<Vec<FileEntry>, String> {
    let read_dir = sftp
        .read_dir(path)
        .await
        .map_err(|e| format!("读取目录失败: {}", e))?;

    let mut entries: Vec<FileEntry> = read_dir
        .map(|entry| {
            let meta = entry.metadata();
            let file_type = meta.file_type();
            FileEntry {
                name: entry.file_name(),
                path: entry.path(),
                is_dir: file_type.is_dir(),
                is_symlink: file_type.is_symlink(),
                size: meta.len(),
                modified: format_mtime(meta.mtime),
            }
        })
        .collect();

    // 目录在前，其次按名称排序
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// 获取家目录（canonicalize(".")）
pub async fn home_dir(sftp: &SftpSession) -> Result<String, String> {
    sftp.canonicalize(".")
        .await
        .map_err(|e| format!("获取家目录失败: {}", e))
}

/// 读取文本文件内容（限制 10MB）
pub async fn read_text_file(sftp: &SftpSession, path: &str) -> Result<FileContent, String> {
    // 先取文件信息判断大小
    let stat = sftp
        .metadata(path)
        .await
        .map_err(|e| format!("获取文件信息失败: {}", e))?;

    let size = stat.len();
    if stat.file_type().is_dir() {
        return Err("这是目录，不是文件".into());
    }
    if size > 10 * 1024 * 1024 {
        return Err(format!("文件 {} MB 过大，请下载到本地查看", size / 1024 / 1024));
    }

    // 读取文件内容
    let mut file = sftp
        .open(path)
        .await
        .map_err(|e| format!("打开文件失败: {}", e))?;

    let mut buf = Vec::with_capacity(size as usize);
    file.read_to_end(&mut buf)
        .await
        .map_err(|e| format!("读取文件失败: {}", e))?;

    let content = String::from_utf8_lossy(&buf).into_owned();
    Ok(FileContent {
        content,
        size,
        truncated: false,
    })
}

/// 文件内容返回给前端
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub content: String,
    pub size: u64,
    pub truncated: bool,
}

/// 判断文件后缀是否为可预览的文本类型
pub fn is_previewable(filename: &str) -> bool {
    let ext = StdPath::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    matches!(
        ext.as_str(),
        "log" | "txt" | "conf" | "cfg" | "json" | "yaml" | "yml"
            | "ini" | "env" | "md" | "csv" | "tsv" | "xml" | "sql"
            | "sh" | "py" | "js" | "ts" | "go" | "rs" | "java" | "c"
            | "cpp" | "h" | "properties" | "toml"
    )
}

/// 将 unix 时间戳格式化为本地可读时间
fn format_mtime(mtime: Option<u32>) -> String {
    match mtime {
        Some(ts) => {
            let dt = UNIX_EPOCH + Duration::from_secs(ts as u64);
            let local: chrono::DateTime<chrono::Local> = dt.into();
            local.format("%Y-%m-%d %H:%M").to_string()
        }
        None => "-".into(),
    }
}
