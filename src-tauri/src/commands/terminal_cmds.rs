use tauri::State;

use crate::ssh::session::build_config_from_server;
use crate::ssh::session::SessionStatusInfo;
use crate::AppState;

#[tauri::command]
pub async fn terminal_connect(
    state: State<'_, AppState>,
    server_id: String,
    session_id: String,
) -> Result<String, serde_json::Value> {
    // 从数据库 + Keychain 构建连接配置
    let server = {
        let db = state.db.lock().await;
        db.get_server(&server_id)
            .map_err(|e| serde_json::json!({ "error": e.to_string() }))?
            .ok_or_else(|| serde_json::json!({ "error": "服务器不存在" }))?
    };
    let config =
        build_config_from_server(&server).map_err(|e| serde_json::json!({ "error": e }))?;

    // 建立连接（ConnectionManager 内部自锁，握手全程不阻塞其他终端操作）
    let manager = &state.ssh_manager;
    manager
        .create_session(&session_id, &server_id, &config)
        .await
        .map_err(|e| serde_json::json!({ "error": e }))
}

#[tauri::command]
pub async fn terminal_input(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let manager = &state.ssh_manager;
    manager.write(&session_id, data.as_bytes()).await
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, AppState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let manager = &state.ssh_manager;
    manager.resize(&session_id, cols, rows).await
}

#[tauri::command]
pub async fn terminal_close(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    // 关闭会话前获取其 server_id，联动清理 SFTP 会话
    let server_id = {
        let manager = &state.ssh_manager;
        let sid = manager.session_server_id(&session_id).await;
        manager.close_session(&session_id).await;
        sid
    };

    if let Some(sid) = server_id {
        let sftp = &state.sftp_manager;
        sftp.close_for_session(&sid, &session_id).await;
    }
    Ok(())
}

/// 查询会话当前状态（状态栏：user@host:路径）
#[tauri::command]
pub async fn terminal_status(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<SessionStatusInfo, String> {
    let manager = &state.ssh_manager;
    manager.get_status(&session_id).await
}

/// 快捷命令在发送成功后写入审计和最近使用，避免界面提前显示成功。
#[tauri::command]
pub async fn terminal_execute(
    state: State<'_, AppState>,
    session_id: String,
    command: String,
) -> Result<(), String> {
    if command.trim().is_empty() || command.contains('\0') {
        return Err("命令不能为空或包含空字符".into());
    }
    let sid = state
        .ssh_manager
        .session_server_id(&session_id)
        .await
        .ok_or("连接已断开")?;
    state
        .ssh_manager
        .write(&session_id, format!("{command}\n").as_bytes())
        .await?;
    let mut db = state.db.lock().await;
    db.insert_log(&sid, &command, super::log_cmds::assess_risk(&command))
        .map_err(|e| format!("命令已发送，但审计日志保存失败: {e}"))?;
    db.touch_recent_command(&sid, &command)
        .map_err(|e| format!("命令已发送，但历史记录保存失败: {e}"))
}
