use tauri::State;

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
    let db = state.db.lock().await;
    let server = db.insert_server(&input).map_err(|e| e.to_string())?;

    // 密码存 Keychain，不落库
    if let Some(pwd) = password {
        if !pwd.is_empty() {
            keychain::store_password(&server.id, &pwd)?;
        }
    }

    // 私钥 passphrase 同样存 Keychain
    if let Some(pass) = key_passphrase {
        if !pass.is_empty() {
            keychain::store_key_passphrase(&server.id, &pass)?;
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
    db.update_server(&id, &input).map_err(|e| e.to_string())?;

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

    Ok(())
}

#[tauri::command]
pub async fn server_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_server(&id).map_err(|e| e.to_string())?;
    // 清理 Keychain 中的密码与私钥 passphrase（忽略不存在的错误）
    let _ = keychain::delete_password(&id);
    let _ = keychain::delete_key_passphrase(&id);
    Ok(())
}

#[tauri::command]
pub async fn server_test(
    _state: State<'_, AppState>,
    input: ServerInput,
    password: Option<String>,
    key_passphrase: Option<String>,
) -> Result<serde_json::Value, String> {
    // 构建临时连接配置进行测试
    let config = ConnectConfig {
        host: input.host.clone(),
        port: input.port.unwrap_or(22),
        username: input.username.clone().unwrap_or_else(|| "root".into()),
        auth_type: input.auth_type.clone(),
        password,
        key_path: input.key_path.clone(),
        key_passphrase,
    };

    // 创建丢弃输出的 dummy channel（测试不需要终端输出）
    let (output_tx, _output_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // 尝试连接，成功则立即断开
    match crate::ssh::session::connect(
        "test".to_string(),
        "test".to_string(),
        &config,
        output_tx,
    )
    .await
    {
        Ok(_handle) => {
            // drop handle → mpsc channel 关闭 → I/O task 自动退出
            Ok(serde_json::json!({ "success": true }))
        }
        Err(translated_err) => Ok(serde_json::json!({
            "success": false,
            "error": translated_err
        })),
    }
}
