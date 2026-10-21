use tauri::{AppHandle, State};

use crate::secret::keychain;
use crate::ssh::session::ConnectConfig;
use crate::storage::server_repo::{Server, ServerInput};
use crate::AppState;

#[tauri::command]
pub async fn server_list(state: State<'_, AppState>) -> Result<Vec<Server>, String> {
    let db = state.db.lock().await;
    db.list_servers().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn server_add(
    state: State<'_, AppState>,
    input: ServerInput,
    password: Option<String>,
    key_passphrase: Option<String>,
) -> Result<Server, String> {
    crate::storage::server_repo::validate_server_input(&input)?;
    let db = state.db.lock().await;
    let server = db.insert_server(&input).map_err(|e| e.to_string())?;

    // 密码存 Keychain，不落库
    if let Some(pwd) = password {
        if !pwd.is_empty() {
            if let Err(e) = keychain::store_password(&server.id, &pwd) {
                let _ = db.delete_server(&server.id);
                return Err(e);
            }
        }
    }

    // 私钥 passphrase 同样存 Keychain
    if let Some(pass) = key_passphrase {
        if !pass.is_empty() {
            if let Err(e) = keychain::store_key_passphrase(&server.id, &pass) {
                let _ = db.delete_server(&server.id);
                let _ = keychain::delete_password(&server.id);
                return Err(e);
            }
        }
    }

    Ok(server)
}

#[tauri::command]
pub async fn server_update(
    state: State<'_, AppState>,
    id: String,
    input: ServerInput,
    password: Option<String>,
    key_passphrase: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    crate::storage::server_repo::validate_server_input(&input)?;
    db.get_server(&id)
        .map_err(|e| e.to_string())?
        .ok_or("服务器不存在")?;

    if let Some(pwd) = password {
        if !pwd.is_empty() {
            keychain::store_password(&id, &pwd)?;
        }
    }

    if let Some(pass) = key_passphrase {
        if !pass.is_empty() {
            keychain::store_key_passphrase(&id, &pass)?;
        }
    }

    db.update_server(&id, &input).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn server_delete(
    _app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    state.ssh_manager.close_server(&id).await;
    {
        let db = state.db.lock().await;
        db.delete_server(&id).map_err(|e| e.to_string())?;
    }

    // 清理 Keychain 中的密码与私钥 passphrase（忽略不存在的错误）
    let _ = keychain::delete_password(&id);
    let _ = keychain::delete_key_passphrase(&id);

    // 清理该服务器的 SFTP 会话（避免句柄泄漏）
    let manager = &state.sftp_manager;
    manager.close(&id).await;

    Ok(())
}

#[tauri::command]
pub async fn server_test(
    app: AppHandle,
    state: State<'_, AppState>,
    input: ServerInput,
    password: Option<String>,
    key_passphrase: Option<String>,
    server_id: Option<String>,
) -> Result<serde_json::Value, String> {
    crate::storage::server_repo::validate_server_input(&input)?;
    let saved = if let Some(id) = server_id {
        let db = state.db.lock().await;
        db.get_server(&id)
            .map_err(|e| e.to_string())?
            .map(|s| crate::ssh::session::build_config_from_server(&s))
            .transpose()?
    } else {
        None
    };
    // 构建临时连接配置进行测试
    let config = ConnectConfig {
        host: input.host.clone(),
        port: input.port.unwrap_or(22),
        username: input.username.clone().unwrap_or_else(|| "root".into()),
        auth_type: input.auth_type.clone(),
        password: password.or_else(|| saved.as_ref().and_then(|c| c.password.clone())),
        key_path: input.key_path.clone(),
        key_passphrase: key_passphrase.or_else(|| saved.and_then(|c| c.key_passphrase)),
    };

    // 测试连接无需展示终端输出
    let (output_tx, _output_rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();

    // 尝试连接，成功则立即断开
    // 测试连接同样先核对 SSH 主机指纹
    match crate::ssh::session::connect(
        app,
        uuid::Uuid::new_v4().to_string(),
        uuid::Uuid::new_v4().to_string(),
        &config,
        output_tx,
    )
    .await
    {
        Ok(handle) => {
            let _ = handle.shutdown.send(true);
            Ok(serde_json::json!({ "success": true }))
        }
        Err(translated_err) => Ok(serde_json::json!({
            "success": false,
            "error": translated_err
        })),
    }
}
