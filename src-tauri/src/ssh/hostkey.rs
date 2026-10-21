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
#[derive(Debug, PartialEq, Eq)]
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
    check_content(&content, host, port, key_str)
}

fn check_content(content: &str, host: &str, port: u16, key_str: &str) -> KnownStatus {
    for line in content.lines().rev() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 && parts[0] == host && parts[1] == port.to_string() {
            return if parts[2..].join(" ") == key_str {
                KnownStatus::Trusted
            } else {
                KnownStatus::Changed
            };
        }
    }
    KnownStatus::Unknown
}

fn replace_record(content: &str, host: &str, port: u16, key: &str) -> String {
    let port = port.to_string();
    let mut lines: Vec<&str> = content
        .lines()
        .filter(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            !(parts.len() >= 2 && parts[0] == host && parts[1] == port)
        })
        .collect();
    let record = format!("{host} {port} {key}");
    lines.push(&record);
    lines.join("\n") + "\n"
}

/// 追加一条受信任记录：`<host> <port> <openssh-public-key>`
pub fn add(app: &tauri::AppHandle, host: &str, port: u16, key_str: &str) -> std::io::Result<()> {
    static WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = WRITE_LOCK
        .lock()
        .map_err(|_| std::io::Error::other("known_hosts 锁不可用"))?;
    let path = known_hosts_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e),
    };
    let temp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        file.write_all(replace_record(&content, host, port, key_str).as_bytes())?;
        file.sync_all()?;
        fs::rename(&temp, &path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn full_openssh_key_is_compared() {
        let content = "example.com 22 ssh-ed25519 AAAATEST\n";
        assert_eq!(
            check_content(content, "example.com", 22, "ssh-ed25519 AAAATEST"),
            KnownStatus::Trusted
        );
        assert_eq!(
            check_content(content, "example.com", 22, "ssh-ed25519 CHANGED"),
            KnownStatus::Changed
        );
        assert_eq!(
            check_content(content, "example.com", 2222, "ssh-ed25519 AAAATEST"),
            KnownStatus::Unknown
        );
    }
    #[test]
    fn accepting_a_changed_key_replaces_old_entries() {
        let content = "a 22 ssh-ed25519 OLD\na 22 ssh-ed25519 OLDER\nb 22 ssh-rsa OTHER\n";
        let updated = replace_record(content, "a", 22, "ssh-ed25519 NEW");
        assert_eq!(
            check_content(&updated, "a", 22, "ssh-ed25519 NEW"),
            KnownStatus::Trusted
        );
        assert_eq!(updated.lines().count(), 2);
        assert!(updated.contains("b 22 ssh-rsa OTHER"));
    }
}
