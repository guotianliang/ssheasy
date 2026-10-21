use std::collections::HashMap;
use std::path::Path as StdPath;
use std::sync::Arc;
use std::time::{Duration, UNIX_EPOCH};

use tokio::fs::File as LocalFile;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use russh::client;
use russh_sftp::client::SftpSession;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::events;

use super::session::ClientHandler;
use crate::ssh::manager::ConnectionManager;

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
    ssh_manager: Arc<ConnectionManager>,
    sessions: tokio::sync::Mutex<HashMap<String, (String, Arc<SftpSession>)>>,
    gates: tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
}

impl SftpManager {
    pub fn new(_app: AppHandle, ssh_manager: Arc<ConnectionManager>) -> Self {
        Self {
            ssh_manager,
            sessions: Default::default(),
            gates: Default::default(),
        }
    }

    pub async fn session(&self, server_id: &str) -> Result<Arc<SftpSession>, String> {
        let gate = self
            .gates
            .lock()
            .await
            .entry(server_id.to_owned())
            .or_default()
            .clone();
        let _guard = gate.lock().await;
        let (session_id, client) = self
            .ssh_manager
            .client_by_server(server_id)
            .await
            .ok_or("请先连接该服务器的终端，再使用文件管理")?;
        if let Some((id, sftp)) = self.sessions.lock().await.get(server_id) {
            if id == &session_id {
                return Ok(sftp.clone());
            }
        }
        self.close(server_id).await;
        let sftp = Arc::new(Self::open_on_client(client).await?);
        self.sessions
            .lock()
            .await
            .insert(server_id.to_owned(), (session_id, sftp.clone()));
        Ok(sftp)
    }

    async fn open_on_client(
        client: Arc<tokio::sync::Mutex<client::Handle<ClientHandler>>>,
    ) -> Result<SftpSession, String> {
        let g = client.lock().await;
        let channel = g
            .channel_open_session()
            .await
            .map_err(|e| format!("打开会话通道失败: {e}"))?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| format!("服务器无法启动 SFTP: {e}"))?;
        SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| format!("初始化 SFTP 失败: {e}"))
    }

    pub async fn close_for_session(&self, server_id: &str, session_id: &str) {
        let removed = {
            let mut sessions = self.sessions.lock().await;
            if sessions
                .get(server_id)
                .is_some_and(|(id, _)| id == session_id)
            {
                sessions.remove(server_id)
            } else {
                None
            }
        };
        if let Some((_, sftp)) = removed {
            let _ = sftp.close().await;
        }
    }

    pub async fn close(&self, server_id: &str) {
        let removed = self.sessions.lock().await.remove(server_id);
        if let Some((_, sftp)) = removed {
            let _ = sftp.close().await;
        }
    }
}

/// 列出目录内容
pub async fn list_dir(sftp: &SftpSession, path: &str) -> Result<Vec<FileEntry>, String> {
    let read_dir = sftp
        .read_dir(path)
        .await
        .map_err(|e| format!("读取目录失败: {}", e))?;

    let mut entries: Vec<FileEntry> = read_dir
        .filter(|entry| !matches!(entry.file_name().as_str(), "." | ".."))
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
        return Err(format!(
            "文件 {} MB 过大，请下载到本地查看",
            size / 1024 / 1024
        ));
    }

    // 读取文件内容
    let file = sftp
        .open(path)
        .await
        .map_err(|e| format!("打开文件失败: {}", e))?;

    let mut buf = Vec::with_capacity(size as usize);
    file.take(10 * 1024 * 1024 + 1)
        .read_to_end(&mut buf)
        .await
        .map_err(|e| format!("读取文件失败: {}", e))?;

    if buf.len() > 10 * 1024 * 1024 {
        return Err("文件过大，请下载后查看".into());
    }
    let content =
        String::from_utf8(buf).map_err(|_| "文件不是 UTF-8 文本，请下载后查看".to_string())?;
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
        "log"
            | "txt"
            | "conf"
            | "cfg"
            | "json"
            | "yaml"
            | "yml"
            | "ini"
            | "env"
            | "md"
            | "csv"
            | "tsv"
            | "xml"
            | "sql"
            | "sh"
            | "py"
            | "js"
            | "ts"
            | "go"
            | "rs"
            | "java"
            | "c"
            | "cpp"
            | "h"
            | "properties"
            | "toml"
    )
}

fn progress(app: Option<&AppHandle>, server_id: &str, bytes: u64, total: u64, done: bool) {
    if let Some(app) = app {
        let percentage = if done {
            100
        } else {
            (bytes.saturating_mul(100) / total.max(1)).min(99)
        };
        let _ = app.emit(
            events::SFTP_PROGRESS,
            json!({"serverId":server_id,"progress":percentage,"bytes":bytes,"total":total}),
        );
    }
}

/// 下载先写同目录临时文件，完整写入后才原子替换目标。
pub async fn download_to_file(
    sftp: &SftpSession,
    app: Option<&AppHandle>,
    server_id: &str,
    path: &str,
    dest_path: &str,
) -> Result<u64, String> {
    let stat = sftp
        .metadata(path)
        .await
        .map_err(|e| format!("获取文件信息失败: {e}"))?;
    if stat.file_type().is_dir() {
        return Err("这是目录，不是文件".into());
    }
    let size = stat.len();
    let dest = StdPath::new(dest_path);
    let temp = dest.with_file_name(format!(".ssheasy-{}.part", uuid::Uuid::new_v4()));
    let result = async {
        let mut remote = sftp
            .open(path)
            .await
            .map_err(|e| format!("打开远程文件失败: {e}"))?;
        let mut options = tokio::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        options.mode(0o600);
        let mut local = options
            .open(&temp)
            .await
            .map_err(|e| format!("无法创建下载文件: {e}"))?;
        let mut buf = vec![0u8; 64 * 1024];
        let mut written = 0u64;
        let mut last_emit = 0u64;
        loop {
            let n = remote
                .read(&mut buf)
                .await
                .map_err(|e| format!("读取远程文件失败: {e}"))?;
            if n == 0 {
                break;
            }
            local
                .write_all(&buf[..n])
                .await
                .map_err(|e| format!("写入本地文件失败: {e}"))?;
            written += n as u64;
            if written - last_emit >= 512 * 1024 {
                last_emit = written;
                progress(app, server_id, written, size, false);
            }
        }
        if written != size {
            return Err("远程文件大小在下载过程中发生变化，请重试".into());
        }
        local.flush().await.map_err(|e| e.to_string())?;
        local.sync_all().await.map_err(|e| e.to_string())?;
        drop(local);
        remote.shutdown().await.map_err(|e| e.to_string())?;
        tokio::fs::rename(&temp, dest)
            .await
            .map_err(|e| format!("保存下载文件失败: {e}"))?;
        progress(app, server_id, written, size, true);
        Ok(written)
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(&temp).await;
    }
    result
}

/// 上传先完成临时文件，再移动到目标；覆盖时保留旧文件直到新文件就绪。
pub async fn upload_from_file(
    sftp: &SftpSession,
    app: Option<&AppHandle>,
    server_id: &str,
    remote_path: &str,
    local_path: &str,
    overwrite: bool,
) -> Result<u64, String> {
    use russh_sftp::protocol::{FileAttributes, OpenFlags};
    let mut local = LocalFile::open(local_path)
        .await
        .map_err(|e| format!("打开本地文件失败: {e}"))?;
    let meta = local.metadata().await.map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("请选择普通文件".into());
    }
    let existing = sftp.symlink_metadata(remote_path).await.ok();
    if existing.is_some() && !overwrite {
        return Err("FILE_EXISTS".into());
    }
    if existing
        .as_ref()
        .is_some_and(|m| m.file_type().is_dir() || m.file_type().is_symlink())
    {
        return Err("不能覆盖目录或符号链接".into());
    }
    let temp = format!(
        "{}/.ssheasy-{}.part",
        parent_of(remote_path).trim_end_matches('/'),
        uuid::Uuid::new_v4()
    );
    let size = meta.len();
    let result = async {
        let mut attrs = FileAttributes::empty();
        attrs.permissions = Some(0o600);
        let mut remote = sftp
            .open_with_flags_and_attributes(
                &temp,
                OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::EXCLUDE,
                attrs,
            )
            .await
            .map_err(|e| format!("创建远程临时文件失败: {e}"))?;
        let mut buf = vec![0; 64 * 1024];
        let mut written = 0u64;
        let mut last_emit = 0u64;
        loop {
            let n = local
                .read(&mut buf)
                .await
                .map_err(|e| format!("读取本地文件失败: {e}"))?;
            if n == 0 {
                break;
            }
            remote
                .write_all(&buf[..n])
                .await
                .map_err(|e| format!("上传失败: {e}"))?;
            written += n as u64;
            if written - last_emit >= 512 * 1024 {
                last_emit = written;
                progress(app, server_id, written, size, false);
            }
        }
        if written != size {
            return Err("本地文件大小在上传过程中发生变化，请重试".into());
        }
        remote.flush().await.map_err(|e| e.to_string())?;
        remote.shutdown().await.map_err(|e| e.to_string())?;
        if let Some(metadata) = &existing {
            let mut attrs = FileAttributes::empty();
            attrs.permissions = metadata.permissions;
            sftp.set_metadata(&temp, attrs)
                .await
                .map_err(|e| format!("保留文件权限失败: {e}"))?;
        }
        let backup = format!(
            "{}/.ssheasy-{}.backup",
            parent_of(remote_path).trim_end_matches('/'),
            uuid::Uuid::new_v4()
        );
        let backed_up = overwrite && sftp.symlink_metadata(remote_path).await.is_ok();
        if backed_up {
            sftp.rename(remote_path, &backup)
                .await
                .map_err(|e| format!("备份旧文件失败: {e}"))?;
        }
        if let Err(e) = sftp.rename(&temp, remote_path).await {
            if backed_up && sftp.rename(&backup, remote_path).await.is_err() {
                return Err(format!("替换失败: {e}；旧文件保留在 {backup}"));
            }
            return Err(format!("保存远程文件失败: {e}"));
        }
        if backed_up {
            sftp.remove_file(&backup)
                .await
                .map_err(|e| format!("上传已完成，旧文件备份 {backup} 清理失败: {e}"))?;
        }
        progress(app, server_id, written, size, true);
        Ok(written)
    }
    .await;
    if result.is_err() {
        let _ = sftp.remove_file(&temp).await;
    }
    result
}

/// 删除远程文件
pub async fn delete_file(sftp: &SftpSession, path: &str) -> Result<(), String> {
    sftp.remove_file(path)
        .await
        .map_err(|e| format!("删除文件失败: {}", e))
}

/// 删除远程路径：文件直接删；目录递归删除其全部内容与自身
pub async fn remove_path(sftp: &SftpSession, path: &str) -> Result<(), String> {
    validate_remove_path(path)?;
    let stat = sftp
        .symlink_metadata(path)
        .await
        .map_err(|e| format!("获取信息失败: {}", e))?;
    if stat.file_type().is_dir() && !stat.file_type().is_symlink() {
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
        .filter(|entry| !matches!(entry.file_name().as_str(), "." | ".."))
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
    validate_rename(from, to)?;
    if sftp.symlink_metadata(to).await.is_ok() {
        return Err("目标名称已存在，请使用其他名称".into());
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

fn validate_remove_path(path: &str) -> Result<(), String> {
    if !path.starts_with('/')
        || path.trim_matches('/').is_empty()
        || path.split('/').any(|p| matches!(p, "." | ".."))
        || path.contains('\0')
    {
        return Err("拒绝删除根目录或不规范路径".into());
    }
    Ok(())
}

pub fn validate_rename(from: &str, to: &str) -> Result<(), String> {
    let name = to.rsplit('/').next().unwrap_or("");
    if name.is_empty()
        || matches!(name, "." | "..")
        || name.contains(['\\', '\0'])
        || !from.starts_with('/')
        || !to.starts_with('/')
        || to.split('/').any(|p| matches!(p, "." | ".."))
        || parent_of(from) != parent_of(to)
    {
        return Err("新名称不合法，且重命名不能改变所在目录".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rename_accepts_full_paths() {
        assert!(validate_rename("/var/log/old.log", "/var/log/new.log").is_ok());
        assert!(validate_rename("/a", "/b").is_ok());
        assert!(validate_rename("/a", "/release..bak").is_ok());
    }
    #[test]
    fn rename_rejects_traversal() {
        for to in [
            "/var/../b",
            "/else/b",
            "/var/..",
            "/var/",
            "/var/a\\b",
            "/var/a\0b",
        ] {
            assert!(validate_rename("/var/a", to).is_err(), "{to}");
        }
    }
    #[test]
    fn deletion_rejects_root_and_dot_components() {
        for path in ["/", "//", "/a/..", "/a/./b", "relative"] {
            assert!(validate_remove_path(path).is_err());
        }
        assert!(validate_remove_path("/tmp/a").is_ok());
    }
}
