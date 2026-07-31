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
