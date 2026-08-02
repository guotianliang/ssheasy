use rusqlite::params;
use serde::Serialize;

use super::database::Database;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentCommand {
    pub id: i64,
    pub server_id: String,
    pub command: String,
    pub executed_at: String,
}

impl Database {
    /// 记录一条最近使用的命令（同一服务器同一命令只保留最新一次，最多保留 30 条）
    pub fn touch_recent_command(
        &self,
        server_id: &str,
        command: &str,
    ) -> Result<(), rusqlite::Error> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        // 先删除同服务器同命令的旧记录，再插入新记录（保持最新在前）
        self.conn.execute(
            "DELETE FROM recent_commands WHERE server_id = ?1 AND command = ?2",
            params![server_id, command],
        )?;
        self.conn.execute(
            "INSERT INTO recent_commands (server_id, command, executed_at) VALUES (?1, ?2, ?3)",
            params![server_id, command, now],
        )?;
        // 只保留最近 30 条
        self.conn.execute(
            "DELETE FROM recent_commands WHERE id NOT IN (
                SELECT id FROM recent_commands WHERE server_id = ?1 ORDER BY executed_at DESC, id DESC LIMIT 30
            )",
            params![server_id],
        )?;
        Ok(())
    }

    /// 查询某服务器最近使用的命令（最新在前）
    pub fn list_recent_commands(
        &self,
        server_id: &str,
        limit: i64,
    ) -> Result<Vec<RecentCommand>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, server_id, command, executed_at FROM recent_commands WHERE server_id = ?1 ORDER BY executed_at DESC, id DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![server_id, limit], |row| {
            Ok(RecentCommand {
                id: row.get(0)?,
                server_id: row.get(1)?,
                command: row.get(2)?,
                executed_at: row.get(3)?,
            })
        })?;
        rows.collect()
    }
}
