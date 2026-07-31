use tauri::State;

use crate::storage::path_bookmark_repo::{PathBookmark, PathBookmarkInput};
use crate::AppState;

#[tauri::command]
pub async fn path_bookmark_list(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<PathBookmark>, String> {
    let db = state.db.lock().await;
    db.list_path_bookmarks(&server_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn path_bookmark_add(
    state: State<'_, AppState>,
    input: PathBookmarkInput,
) -> Result<PathBookmark, String> {
    let db = state.db.lock().await;
    db.insert_path_bookmark(&input).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn path_bookmark_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_path_bookmark(&id).map_err(|e| e.to_string())
}
