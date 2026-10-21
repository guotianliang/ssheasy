use std::path::Path as StdPath;
use std::sync::Arc;

use russh_sftp::client::SftpSession;
use tauri::{AppHandle, State};

use crate::ssh::sftp::{self, FileContent, FileDownload, FileEntry};
use crate::AppState;

/// 获取（或建立）某服务器的 SFTP 会话（所有命令共用）
async fn get_sftp_session(
    state: &State<'_, AppState>,
    server_id: &str,
) -> Result<Arc<SftpSession>, String> {
    state.sftp_manager.session(server_id).await
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
    let manager = &state.sftp_manager;
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

/// 下载文件：分块写入临时文件，完成后替换 dest_path
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
    let size = sftp::download_to_file(&session, Some(&app), &server_id, &path, &dest_path).await?;
    let name = StdPath::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download")
        .to_string();
    state
        .db
        .lock()
        .await
        .insert_log(
            &server_id,
            &format!("SFTP 下载完成: {path} ({size} 字节)"),
            "low",
        )
        .map_err(|e| e.to_string())?;
    Ok(FileDownload { name, size })
}

/// 上传文件（从本地路径分块读取）
/// overwrite=false 时若远程已存在同名文件，返回 "FILE_EXISTS" 由前端确认后重试
#[tauri::command]
pub async fn sftp_upload(
    state: State<'_, AppState>,
    app: AppHandle,
    server_id: String,
    path: String,
    local_path: String,
    overwrite: bool,
) -> Result<(), String> {
    let session = get_sftp_session(&state, &server_id).await?;
    sftp::upload_from_file(
        &session,
        Some(&app),
        &server_id,
        &path,
        &local_path,
        overwrite,
    )
    .await?;
    state
        .db
        .lock()
        .await
        .insert_log(&server_id, &format!("SFTP 上传完成: {path}"), "medium")
        .map_err(|e| e.to_string())
}

/// 删除远程文件或目录（目录递归删除其内容与自身）
#[tauri::command]
pub async fn sftp_delete(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
) -> Result<(), String> {
    let session = get_sftp_session(&state, &server_id).await?;
    sftp::remove_path(&session, &path).await?;
    state
        .db
        .lock()
        .await
        .insert_log(&server_id, &format!("SFTP 删除完成: {path}"), "high")
        .map_err(|e| e.to_string())
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
    sftp::rename_entry(&session, &from, &to).await?;
    state
        .db
        .lock()
        .await
        .insert_log(
            &server_id,
            &format!("SFTP 重命名完成: {from} → {to}"),
            "medium",
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_mkdir(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
) -> Result<(), String> {
    let session = get_sftp_session(&state, &server_id).await?;
    session
        .create_dir(&path)
        .await
        .map_err(|e| format!("创建目录失败: {e}"))?;
    state
        .db
        .lock()
        .await
        .insert_log(&server_id, &format!("SFTP 创建目录: {path}"), "medium")
        .map_err(|e| e.to_string())
}
