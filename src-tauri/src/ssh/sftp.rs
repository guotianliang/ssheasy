use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};
use std::path::Path as StdPath;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::fs::File as LocalFile;

use russh::client;
use russh::keys::key::PrivateKeyWithHashAlg;
use russh_sftp::client::SftpSession;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::events;

use crate::ssh::manager::ConnectionManager;
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
/// sessions 使用内部 Mutex：建连在锁外进行，避免一个文件操作阻塞其他操作
pub struct SftpManager {
    app: AppHandle,
    /// 终端连接管理器：用于复用已建立的 SSH 连接（同一条，避免重复握手/认证）
    ssh_manager: Arc<tokio::sync::Mutex<ConnectionManager>>,
    sessions: tokio::sync::Mutex<HashMap<String, Arc<SftpSession>>>,
}

impl SftpManager {
    pub fn new(app: AppHandle, ssh_manager: Arc<tokio::sync::Mutex<ConnectionManager>>) -> Self {
        Self {
            app,
            ssh_manager,
            sessions: tokio::sync::Mutex::new(HashMap::new()),
        }
    }

    /// 获取（或建立）某服务器的 SFTP 会话
    pub async fn session(
        &self,
        server_id: &str,
        config: &ConnectConfig,
    ) -> Result<Arc<SftpSession>, String> {
        // 先查缓存（短锁）
        if let Some(existing) = self.sessions.lock().await.get(server_id) {
            return Ok(existing.clone());
        }

        // 优先复用终端已建立的 SSH 连接（同一条，省一次握手/认证/端口占用）
        if let Some(client) = self.ssh_manager.lock().await.client_by_server(server_id).await {
            if let Ok(sftp) = Self::open_on_client(client).await {
                let arc = Arc::new(sftp);
                self.sessions
                    .lock()
                    .await
                    .insert(server_id.to_string(), arc.clone());
                return Ok(arc);
            } else {
                log::warn!("复用终端连接建立 SFTP 失败，回退到独立连接");
            }
        }

        // 回退：建立一条独立的 SSH 连接并打开 sftp 子系统
        let sftp = Self::connect(self.app.clone(), config).await?;
        let arc = Arc::new(sftp);

        // 注册（短锁；重复连接时后到者覆盖，先到者的连接会因 Arc drop 自动关闭）
        self.sessions
            .lock()
            .await
            .insert(server_id.to_string(), arc.clone());
        Ok(arc)
    }

    /// 在已有的 client::Handle 上开一条 SFTP 子系统通道（复用终端连接）
    async fn open_on_client(
        client: Arc<tokio::sync::Mutex<client::Handle<ClientHandler>>>,
    ) -> Result<SftpSession, String> {
        let g = client.lock().await;
        let channel = g
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

    /// 关闭并移除某服务器的 SFTP 会话
    pub async fn close(&self, server_id: &str) {
        if let Some(sftp) = self.sessions.lock().await.remove(server_id) {
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

/// 将远程文件流式写入本地 dest_path（分块读写，避免大文件整块入内存导致 OOM）
/// 通过 app.emit 周期性推送下载进度事件
pub async fn download_to_file(
    sftp: &SftpSession,
    app: &AppHandle,
    server_id: &str,
    path: &str,
    dest_path: &str,
) -> Result<u64, String> {
    let stat = sftp
        .metadata(path)
        .await
        .map_err(|e| format!("获取文件信息失败: {}", e))?;

    let size = stat.len();
    if stat.file_type().is_dir() {
        return Err("这是目录，不是文件".into());
    }
    if size > 200 * 1024 * 1024 {
        return Err(format!("文件 {} MB 超过下载上限 200MB", size / 1024 / 1024));
    }

    let mut remote = sftp
        .open(path)
        .await
        .map_err(|e| format!("打开文件失败: {}", e))?;

    // 本地目标文件：异步分块落盘（不在内存中缓存整文件）
    let mut local = LocalFile::create(dest_path)
        .await
        .map_err(|e| format!("无法创建本地文件 {}: {}", dest_path, e))?;

    let mut buf = vec![0u8; 64 * 1024];
    let mut written: u64 = 0;
    let mut last_emit: u64 = 0;

    loop {
        let n = remote
            .read(&mut buf)
            .await
            .map_err(|e| format!("读取远程文件失败: {}", e))?;
        if n == 0 {
            break;
        }
        local
            .write_all(&buf[..n])
            .await
            .map_err(|e| format!("写入本地文件失败: {}", e))?;
        written += n as u64;

        // 每写入约 512KB 推送一次进度（节流，避免事件洪泛）
        if written - last_emit >= 512 * 1024 || written == size {
            last_emit = written;
            let pct = if size > 0 {
                (written * 100 / size) as u8
            } else {
                100
            };
            let _ = app.emit(
                events::SFTP_PROGRESS,
                json!({
                    "serverId": server_id,
                    "progress": pct,
                    "bytes": written,
                    "total": size,
                }),
            );
        }
    }
    local
        .flush()
        .await
        .map_err(|e| format!("写入本地文件失败: {}", e))?;

    // 结束再补发一次 100%
    let _ = app.emit(
        events::SFTP_PROGRESS,
        json!({
            "serverId": server_id,
            "progress": 100u8,
            "bytes": written,
            "total": size,
        }),
    );

    Ok(written)
}

/// 上传本地文件到远程路径（base64 解码写入）
/// 限制 200MB
/// overwrite=false 时若远程已存在同名文件，返回 "FILE_EXISTS" 由前端确认后重试
pub async fn write_file_base64(
    sftp: &SftpSession,
    remote_path: &str,
    content_base64: &str,
    overwrite: bool,
) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(content_base64)
        .map_err(|e| format!("base64 解码失败: {}", e))?;

    if bytes.len() > 200 * 1024 * 1024 {
        return Err(format!("文件 {} MB 超过上传上限 200MB", bytes.len() / 1024 / 1024));
    }

    // 非覆盖模式：先检查是否存在，存在则报错让前端弹确认框
    if !overwrite {
        if sftp.metadata(remote_path).await.is_ok() {
            return Err("FILE_EXISTS".into());
        }
    }

    let mut file = sftp
        .create(remote_path)
        .await
        .map_err(|e| format!("创建远程文件失败: {}", e))?;
    file.write_all(&bytes)
        .await
        .map_err(|e| format!("写入文件失败: {}", e))?;
    file.flush()
        .await
        .map_err(|e| format!("写入文件失败: {}", e))?;
    drop(file);
    Ok(())
}

/// 删除远程文件
pub async fn delete_file(sftp: &SftpSession, path: &str) -> Result<(), String> {
    sftp.remove_file(path)
        .await
        .map_err(|e| format!("删除文件失败: {}", e))
}

/// 删除远程路径：文件直接删；目录递归删除其全部内容与自身
pub async fn remove_path(sftp: &SftpSession, path: &str) -> Result<(), String> {
    let stat = sftp
        .metadata(path)
        .await
        .map_err(|e| format!("获取信息失败: {}", e))?;
    if stat.file_type().is_dir() {
        remove_dir_recursive(sftp, path).await
    } else {
        delete_file(sftp, path).await
    }
}

/// 递归删除目录：先删子项（文件/符号链接直接删，子目录递归），最后删空目录本身
async fn remove_dir_recursive(sftp: &SftpSession, path: &str) -> Result<(), String> {
    let read_dir = sftp
        .read_dir(path)
        .await
        .map_err(|e| format!("读取目录失败: {}", e))?;

    // 先收集子项（避免迭代器与异步调用互相借用）
    let mut children: Vec<(String, bool, bool)> = read_dir
        .map(|e| {
            let ft = e.file_type();
            (e.path(), ft.is_dir(), ft.is_symlink())
        })
        .collect();

    for (child_path, is_dir, is_symlink) in children.drain(..) {
        if is_symlink {
            // 符号链接直接删链接本身，不跟随
            sftp.remove_file(&child_path)
                .await
                .map_err(|e| format!("删除符号链接失败: {}", e))?;
        } else if is_dir {
            Box::pin(remove_dir_recursive(sftp, &child_path)).await?;
        } else {
            sftp.remove_file(&child_path)
                .await
                .map_err(|e| format!("删除文件失败: {}", e))?;
        }
    }

    sftp.remove_dir(path)
        .await
        .map_err(|e| format!("删除目录失败: {}", e))
}

/// 取路径的父目录（Unix 风格）
fn parent_of(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    match trimmed.rfind('/') {
        Some(0) | None => "/".to_string(),
        Some(i) => trimmed[..i].to_string(),
    }
}

/// 重命名远程文件/目录
/// 防穿越：目标名不得含路径分隔符或 ".."，且目标必须与源在同一目录
pub async fn rename_entry(sftp: &SftpSession, from: &str, to: &str) -> Result<(), String> {
    if to.is_empty() || to.contains('/') || to.contains("..") || to.contains('\\') {
        return Err("新名称不能包含路径分隔符或 ..".into());
    }
    if parent_of(from) != parent_of(to) {
        return Err("重命名不能改变所在目录".into());
    }
    sftp.rename(from, to)
        .await
        .map_err(|e| format!("重命名失败: {}", e))
}

/// 下载结果（文件已由后端直接写入本地 dest_path，返回元信息供前端确认）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDownload {
    pub name: String,
    pub size: u64,
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
