use tauri::State;

use crate::storage::log_repo::OperationLog;
use crate::storage::recent_command_repo::RecentCommand;
use crate::AppState;

/// 简单的命令风险评级：高危 / 中危 / 低危
fn assess_risk(cmd: &str) -> &'static str {
    let c = cmd.to_lowercase();
    const HIGH: &[&str] = &[
        "rm -rf",
        "rm -fr",
        "mkfs",
        "dd if=",
        "> /dev/sd",
        ":(){",
        "chmod -r ",
        "chown -r ",
        "shutdown",
        "reboot",
        "init 0",
        "init 6",
        "drop database",
        "truncate ",
        "fdisk",
        "parted",
        "kill -9",
        "killall",
    ];
    const MED: &[&str] = &[
        "rm ",
        "chmod",
        "chown",
        " mv ",
        "systemctl restart",
        "systemctl stop",
        "systemctl disable",
        "service ",
        "userdel",
        "groupdel",
        "passwd",
        "crontab",
        "iptables",
        "ufw",
    ];
    if HIGH.iter().any(|p| c.contains(p)) {
        "high"
    } else if MED.iter().any(|p| c.contains(p)) {
        "medium"
    } else {
        "low"
    }
}

/// 记录一次运维操作（由前端在「直接执行」快捷命令时调用）
#[tauri::command]
pub async fn log_operation(
    state: State<'_, AppState>,
    server_id: String,
    command: String,
) -> Result<(), String> {
    let mut db = state.db.lock().await;
    db.insert_log(&server_id, &command, assess_risk(&command))
        .map_err(|e| e.to_string())?;
    // 同时更新「最近使用」
    db.touch_recent_command(&server_id, &command)
        .map_err(|e| e.to_string())
}

/// 查询某服务器的最近使用命令
#[tauri::command]
pub async fn list_recent_commands(
    state: State<'_, AppState>,
    server_id: String,
    limit: Option<i64>,
) -> Result<Vec<RecentCommand>, String> {
    let db = state.db.lock().await;
    let limit = limit.unwrap_or(20).clamp(1, 50);
    db.list_recent_commands(&server_id, limit)
        .map_err(|e| e.to_string())
}

/// 查询操作日志（可按服务器过滤）
#[tauri::command]
pub async fn list_logs(
    state: State<'_, AppState>,
    server_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<OperationLog>, String> {
    let db = state.db.lock().await;
    let limit = limit.unwrap_or(200).clamp(1, 1000);
    db.list_logs(server_id.as_deref(), limit)
        .map_err(|e| e.to_string())
}
