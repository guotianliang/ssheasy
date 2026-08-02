use tauri::State;

use crate::ssh::session::build_config_from_server;
use crate::ssh::session::SessionStatusInfo;
use crate::AppState;

#[tauri::command]
pub async fn terminal_connect(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<String, serde_json::Value> {
    // 从数据库 + Keychain 构建连接配置
    let config = {
        let db = state.db.lock().await;
        let server = db
            .get_server(&server_id)
            .map_err(|e| serde_json::json!({ "error": e.to_string() }))?
            .ok_or_else(|| serde_json::json!({ "error": "服务器不存在" }))?;

        build_config_from_server(&server).map_err(|e| serde_json::json!({ "error": e }))?
    };

    // 建立连接
    let mut manager = state.ssh_manager.lock().await;
    manager
        .create_session(&server_id, &config)
        .await
        .map_err(|e| serde_json::json!({ "error": e }))
}

#[tauri::command]
pub async fn terminal_input(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let manager = state.ssh_manager.lock().await;
    manager.write(&session_id, data.as_bytes())
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, AppState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let manager = state.ssh_manager.lock().await;
    manager.resize(&session_id, cols, rows)
}

#[tauri::command]
pub async fn terminal_close(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let mut manager = state.ssh_manager.lock().await;
    // 关闭会话前获取其 server_id，联动清理 SFTP 会话
    let server_id = manager.session_server_id(&session_id);
    manager.close_session(&session_id);
    drop(manager);

    if let Some(sid) = server_id {
        let mut sftp = state.sftp_manager.lock().await;
        sftp.close(&sid).await;
    }
    Ok(())
}

/// 查询会话当前状态（状态栏：user@host:路径）
#[tauri::command]
pub async fn terminal_status(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<SessionStatusInfo, String> {
    let manager = state.ssh_manager.lock().await;
    manager.get_status(&session_id)
}
