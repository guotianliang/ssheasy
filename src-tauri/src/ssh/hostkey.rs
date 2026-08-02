use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

/// 前端对未知/变更 host key 的决策
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostKeyDecision {
    /// 信任并写入 known_hosts
    AcceptAndSave,
    /// 仅本次信任，不持久化
    AcceptOnce,
    /// 拒绝连接
    Reject,
}

/// known_hosts 中某 host:port 的状态
pub enum KnownStatus {
    /// 已存在且指纹匹配
    Trusted,
    /// 已存在但指纹不匹配（疑似中间人）
    Changed,
    /// 从未见过
    Unknown,
}

fn known_hosts_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .map(|d| d.join("known_hosts"))
        .unwrap_or_else(|_| PathBuf::from("known_hosts"))
}

/// 读取 known_hosts，判断 host:port 的指纹状态
pub fn check(app: &tauri::AppHandle, host: &str, port: u16, key_str: &str) -> KnownStatus {
    let path = known_hosts_path(app);
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return KnownStatus::Unknown,
    };
    for line in content.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 && parts[0] == host && parts[1] == port.to_string() {
            return if parts[2] == key_str {
                KnownStatus::Trusted
            } else {
                KnownStatus::Changed
            };
        }
    }
    KnownStatus::Unknown
}

/// 追加一条受信任记录：`<host> <port> <openssh-public-key>`
pub fn add(app: &tauri::AppHandle, host: &str, port: u16, key_str: &str) -> std::io::Result<()> {
    let path = known_hosts_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = fs::OpenOptions::new().create(true).append(true).open(&path)?;
    writeln!(file, "{} {} {}", host, port, key_str)?;
    // known_hosts 仅属主可读写
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// 删除某 host:port 的所有 known_hosts 记录（删除服务器时清理指纹残留）
pub fn remove(app: &tauri::AppHandle, host: &str, port: u16) -> std::io::Result<()> {
    let path = known_hosts_path(app);
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Ok(()), // 文件不存在视为已清理
    };

    let port_str = port.to_string();
    let filtered: Vec<&str> = content
        .lines()
        .filter(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            !(parts.len() >= 2 && parts[0] == host && parts[1] == port_str)
        })
        .collect();

    let new_content = filtered.join("\n");
    if new_content != content {
        fs::write(&path, if new_content.is_empty() { String::new() } else { new_content + "\n" })?;
    }
    Ok(())
}
