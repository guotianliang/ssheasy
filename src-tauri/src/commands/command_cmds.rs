use tauri::State;

use crate::storage::command_repo::{CommandInput, CommandTemplate};
use crate::AppState;

#[tauri::command]
pub async fn command_list(state: State<'_, AppState>) -> Result<Vec<CommandTemplate>, String> {
    let db = state.db.lock().await;
    db.list_commands().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn command_add(
    state: State<'_, AppState>,
    input: CommandInput,
) -> Result<CommandTemplate, String> {
    let db = state.db.lock().await;
    db.insert_command(&input, false).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn command_update(
    state: State<'_, AppState>,
    id: String,
    input: CommandInput,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_command(&id, &input).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn command_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_command(&id).map_err(|e| e.to_string())
}
