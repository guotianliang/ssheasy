use std::path::Path as StdPath;
use std::sync::Arc;

use russh_sftp::client::SftpSession;
use tauri::{AppHandle, State};

use crate::ssh::session::build_config_from_server;
use crate::ssh::sftp::{self, FileContent, FileDownload, FileEntry};
use crate::AppState;

/// 获取（或建立）某服务器的 SFTP 会话（所有命令共用）
async fn get_sftp_session(
    state: &State<'_, AppState>,
    server_id: &str,
) -> Result<Arc<SftpSession>, String> {
    let config = {
        let db = state.db.lock().await;
        let server = db
            .get_server(server_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "服务器不存在".to_string())?;
        build_config_from_server(&server)?
    };

    // SftpManager 内部自锁：建连在锁外，不阻塞其他文件操作
    let manager = state.sftp_manager.lock().await;
    manager.session(server_id, &config).await
}

/// 列出指定目录的内容（懒加载 SFTP 会话）
#[tauri::command]
pub async fn sftp_list_dir(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    let session = get_sftp_session(&state, &server_id).await?;
    sftp::list_dir(&session, &path).await
}

/// 获取家目录路径
#[tauri::command]
pub async fn sftp_home(state: State<'_, AppState>, server_id: String) -> Result<String, String> {
    let session = get_sftp_session(&state, &server_id).await?;
    sftp::home_dir(&session).await
}

/// 关闭某服务器的 SFTP 会话
#[tauri::command]
pub async fn sftp_close(state: State<'_, AppState>, server_id: String) -> Result<(), String> {
    let manager = state.sftp_manager.lock().await;
    manager.close(&server_id).await;
    Ok(())
}

/// 读取文本文件内容用于预览（限 10MB）
#[tauri::command]
pub async fn sftp_read_file(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
) -> Result<FileContent, String> {
    let session = get_sftp_session(&state, &server_id).await?;
    sftp::read_text_file(&session, &path).await
}

/// 下载文件：流式写入本地 dest_path（限 200MB，避免整块入内存）
/// 下载进度通过 sftp:progress 事件推送
#[tauri::command]
pub async fn sftp_download(
    state: State<'_, AppState>,
    app: AppHandle,
    server_id: String,
    path: String,
    dest_path: String,
) -> Result<FileDownload, String> {
    let session = get_sftp_session(&state, &server_id).await?;
    let size = sftp::download_to_file(&session, &app, &server_id, &path, &dest_path).await?;
    let name = StdPath::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download")
        .to_string();
    Ok(FileDownload { name, size })
}

/// 上传文件（base64 内容写入远程路径）
/// overwrite=false 时若远程已存在同名文件，返回 "FILE_EXISTS" 由前端确认后重试
#[tauri::command]
pub async fn sftp_upload(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
    content_base64: String,
    overwrite: bool,
) -> Result<(), String> {
    let session = get_sftp_session(&state, &server_id).await?;
    sftp::write_file_base64(&session, &path, &content_base64, overwrite).await
}

/// 删除远程文件或目录（目录递归删除其内容与自身）
#[tauri::command]
pub async fn sftp_delete(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
) -> Result<(), String> {
    let session = get_sftp_session(&state, &server_id).await?;
    sftp::remove_path(&session, &path).await
}

/// 重命名远程文件/目录
#[tauri::command]
pub async fn sftp_rename(
    state: State<'_, AppState>,
    server_id: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let session = get_sftp_session(&state, &server_id).await?;
    sftp::rename_entry(&session, &from, &to).await
}
