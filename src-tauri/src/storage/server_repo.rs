use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::database::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub key_path: Option<String>,
    pub group_name: String,
    pub color: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInput {
    pub name: String,
    pub host: String,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub auth_type: String,
    pub key_path: Option<String>,
    pub group_name: Option<String>,
    pub color: Option<String>,
}

/// 校验服务器输入的合法性；不合法时返回人类可读的错误信息
pub fn validate_server_input(input: &ServerInput) -> Result<(), String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("服务器名称不能为空".into());
    }

    let host = input.host.trim();
    if !is_valid_host(host) {
        return Err("主机地址格式不正确（应为 IPv4/IPv6 或合法域名）".into());
    }

    if let Some(port) = input.port {
        if port == 0 {
            return Err("端口号需在 1-65535 之间".into());
        }
    }

    if !matches!(input.auth_type.as_str(), "password" | "key") {
        return Err("认证方式仅支持 password 或 key".into());
    }

    if input.auth_type == "key" && input.key_path.as_deref().map_or(true, |p| p.trim().is_empty()) {
        return Err("使用密钥认证时必须填写私钥路径".into());
    }

    Ok(())
}

/// 判断字符串是否为合法主机地址：IPv4 / IPv6 / 域名
fn is_valid_host(host: &str) -> bool {
    let host = host.trim();
    if host.is_empty() {
        return false;
    }
    if host.parse::<std::net::Ipv4Addr>().is_ok() {
        return true;
    }
    if host.parse::<std::net::Ipv6Addr>().is_ok() {
        return true;
    }
    // 域名：以 . 分隔的标签，每段仅含字母/数字/连字符，不以连字符开头或结尾
    let mut had_label = false;
    for label in host.split('.') {
        if label.is_empty()
            || !label
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
            || label.starts_with('-')
            || label.ends_with('-')
        {
            return false;
        }
        had_label = true;
    }
    had_label
}

impl Database {
    pub fn list_servers(&self) -> Result<Vec<Server>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, host, port, username, auth_type, key_path, group_name, color, sort_order, created_at, updated_at FROM servers ORDER BY sort_order, created_at",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Server {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                username: row.get(4)?,
                auth_type: row.get(5)?,
                key_path: row.get(6)?,
                group_name: row.get(7)?,
                color: row.get(8)?,
                sort_order: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?;
        rows.collect()
    }

    pub fn insert_server(&self, input: &ServerInput) -> Result<Server, rusqlite::Error> {
        if let Err(e) = validate_server_input(input) {
            return Err(rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::new(std::io::ErrorKind::InvalidInput, e)),
            ));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        self.conn.execute(
            "INSERT INTO servers (id, name, host, port, username, auth_type, key_path, group_name, color, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?10)",
            params![
                id,
                input.name,
                input.host,
                input.port.unwrap_or(22),
                input.username.as_deref().unwrap_or("root"),
                input.auth_type,
                input.key_path,
                input.group_name.as_deref().unwrap_or("默认分组"),
                input.color,
                now,
            ],
        )?;
        self.get_server(&id).map(|s| s.unwrap())
    }

    pub fn get_server(&self, id: &str) -> Result<Option<Server>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, host, port, username, auth_type, key_path, group_name, color, sort_order, created_at, updated_at FROM servers WHERE id = ?1",
        )?;
        stmt.query_row(params![id], |row| {
            Ok(Server {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                username: row.get(4)?,
                auth_type: row.get(5)?,
                key_path: row.get(6)?,
                group_name: row.get(7)?,
                color: row.get(8)?,
                sort_order: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .optional()
    }

    pub fn update_server(&self, id: &str, input: &ServerInput) -> Result<(), rusqlite::Error> {
        if let Err(e) = validate_server_input(input) {
            return Err(rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::new(std::io::ErrorKind::InvalidInput, e)),
            ));
        }
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        self.conn.execute(
            "UPDATE servers SET name=?2, host=?3, port=?4, username=?5, auth_type=?6, key_path=?7, group_name=?8, color=?9, updated_at=?10 WHERE id=?1",
            params![
                id,
                input.name,
                input.host,
                input.port.unwrap_or(22),
                input.username.as_deref().unwrap_or("root"),
                input.auth_type,
                input.key_path,
                input.group_name.as_deref().unwrap_or("默认分组"),
                input.color,
                now,
            ],
        )?;
        Ok(())
    }

    pub fn delete_server(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM servers WHERE id = ?1", params![id])?;
        Ok(())
    }
}
