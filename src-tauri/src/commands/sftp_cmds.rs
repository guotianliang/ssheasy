use tauri::State;

use crate::ssh::session::build_config_from_server;
use crate::ssh::sftp::{self, FileEntry, FileContent};
use crate::AppState;

/// 列出指定目录的内容（懒加载 SFTP 会话）
#[tauri::command]
pub async fn sftp_list_dir(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    // 构建连接配置
    let config = {
        let db = state.db.lock().await;
        let server = db
            .get_server(&server_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "服务器不存在".to_string())?;
        build_config_from_server(&server)?
    };

    // 获取（或建立）SFTP 会话
    let session = {
        let mut manager = state.sftp_manager.lock().await;
        manager.session(&server_id, &config).await?
    };

    sftp::list_dir(&session, &path).await
}

/// 获取家目录路径
#[tauri::command]
pub async fn sftp_home(state: State<'_, AppState>, server_id: String) -> Result<String, String> {
    let config = {
        let db = state.db.lock().await;
        let server = db
            .get_server(&server_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "服务器不存在".to_string())?;
        build_config_from_server(&server)?
    };

    let session = {
        let mut manager = state.sftp_manager.lock().await;
        manager.session(&server_id, &config).await?
    };

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
    let config = {
        let db = state.db.lock().await;
        let server = db
            .get_server(&server_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "服务器不存在".to_string())?;
        build_config_from_server(&server)?
    };

    let session = {
        let mut manager = state.sftp_manager.lock().await;
        manager.session(&server_id, &config).await?
    };

    sftp::read_text_file(&session, &path).await
}
