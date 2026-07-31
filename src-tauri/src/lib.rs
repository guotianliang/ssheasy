pub mod commands;
pub mod events;
pub mod secret;
pub mod ssh;
pub mod storage;

use storage::database::Database;
use ssh::manager::ConnectionManager;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub ssh_manager: Arc<Mutex<ConnectionManager>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            std::fs::create_dir_all(&app_dir).ok();

            let db_path = app_dir.join("ssheasy.db");
            let db = Database::open(&db_path).expect("failed to open database");

            // 首次启动时插入内置命令模板
            db.seed_builtin_commands()
                .expect("failed to seed builtin commands");

            let state = AppState {
                db: Arc::new(Mutex::new(db)),
                ssh_manager: Arc::new(Mutex::new(ConnectionManager::new(app.handle().clone()))),
            };

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::server_cmds::server_list,
            commands::server_cmds::server_add,
            commands::server_cmds::server_update,
            commands::server_cmds::server_delete,
            commands::server_cmds::server_test,
            commands::terminal_cmds::terminal_connect,
            commands::terminal_cmds::terminal_input,
            commands::terminal_cmds::terminal_resize,
            commands::terminal_cmds::terminal_close,
            commands::command_cmds::command_list,
            commands::command_cmds::command_add,
            commands::command_cmds::command_update,
            commands::command_cmds::command_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
