use std::sync::Arc;

use russh_sftp::client::SftpSession;
use tauri::State;

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

    let mut manager = state.sftp_manager.lock().await;
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
    let mut manager = state.sftp_manager.lock().await;
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

/// 下载文件（返回 base64，限 200MB）
#[tauri::command]
pub async fn sftp_download(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
) -> Result<FileDownload, String> {
    let session = get_sftp_session(&state, &server_id).await?;
    sftp::read_file_base64(&session, &path).await
}

/// 上传文件（base64 内容写入远程路径）
#[tauri::command]
pub async fn sftp_upload(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
    content_base64: String,
) -> Result<(), String> {
    let session = get_sftp_session(&state, &server_id).await?;
    sftp::write_file_base64(&session, &path, &content_base64).await
}

/// 删除远程文件
#[tauri::command]
pub async fn sftp_delete(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
) -> Result<(), String> {
    let session = get_sftp_session(&state, &server_id).await?;
    sftp::delete_file(&session, &path).await
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
