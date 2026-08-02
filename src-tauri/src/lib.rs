pub mod commands;
pub mod events;
pub mod secret;
pub mod ssh;
pub mod storage;

use storage::database::Database;
use ssh::hostkey::HostKeyDecision;
use ssh::manager::ConnectionManager;
use ssh::sftp::SftpManager;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub ssh_manager: Arc<Mutex<ConnectionManager>>,
    pub sftp_manager: Arc<Mutex<SftpManager>>,
    /// Host Key 验证待决表：token -> 前端决策通道
    pub hostkey_pending:
        Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<HostKeyDecision>>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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

            let ssh_manager = Arc::new(Mutex::new(ConnectionManager::new(app.handle().clone())));
            let sftp_manager = Arc::new(Mutex::new(SftpManager::new(
                app.handle().clone(),
                ssh_manager.clone(),
            )));

            let state = AppState {
                db: Arc::new(Mutex::new(db)),
                ssh_manager,
                sftp_manager,
                hostkey_pending: Arc::new(Mutex::new(HashMap::new())),
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
            commands::hostkey_cmds::host_key_decision,
            commands::log_cmds::log_operation,
            commands::log_cmds::list_logs,
            commands::terminal_cmds::terminal_connect,
            commands::terminal_cmds::terminal_input,
            commands::terminal_cmds::terminal_resize,
            commands::terminal_cmds::terminal_close,
            commands::terminal_cmds::terminal_status,
            commands::command_cmds::command_list,
            commands::command_cmds::command_add,
            commands::command_cmds::command_update,
            commands::command_cmds::command_delete,
            commands::path_bookmark_cmds::path_bookmark_list,
            commands::path_bookmark_cmds::path_bookmark_add,
            commands::path_bookmark_cmds::path_bookmark_delete,
            commands::sftp_cmds::sftp_list_dir,
            commands::sftp_cmds::sftp_home,
            commands::sftp_cmds::sftp_close,
            commands::sftp_cmds::sftp_read_file,
            commands::sftp_cmds::sftp_download,
            commands::sftp_cmds::sftp_upload,
            commands::sftp_cmds::sftp_delete,
            commands::sftp_cmds::sftp_rename,
            commands::log_cmds::list_recent_commands,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
