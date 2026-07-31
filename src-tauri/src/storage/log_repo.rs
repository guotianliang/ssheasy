use rusqlite::params;
use serde::Serialize;

use super::database::Database;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationLog {
    pub id: i64,
    pub server_id: String,
    pub command: String,
    pub risk_level: String,
    pub executed_at: String,
}

impl Database {
    pub fn insert_log(&self, server_id: &str, command: &str, risk_level: &str) -> Result<(), rusqlite::Error> {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        self.conn.execute(
            "INSERT INTO logs (server_id, command, risk_level, executed_at) VALUES (?1, ?2, ?3, ?4)",
            params![server_id, command, risk_level, now],
        )?;
        Ok(())
    }

    pub fn list_logs(&self, server_id: Option<&str>, limit: i64) -> Result<Vec<OperationLog>, rusqlite::Error> {
        let mut results = Vec::new();

        match server_id {
            Some(sid) => {
                let mut stmt = self.conn.prepare(
                    "SELECT id, server_id, command, risk_level, executed_at FROM logs WHERE server_id = ?1 ORDER BY id DESC LIMIT ?2",
                )?;
                let rows = stmt.query_map(params![sid, limit], |row| {
                    Ok(OperationLog {
                        id: row.get(0)?,
                        server_id: row.get(1)?,
                        command: row.get(2)?,
                        risk_level: row.get(3)?,
                        executed_at: row.get(4)?,
                    })
                })?;
                for row in rows {
                    results.push(row?);
                }
            }
            None => {
                let mut stmt = self.conn.prepare(
                    "SELECT id, server_id, command, risk_level, executed_at FROM logs ORDER BY id DESC LIMIT ?1",
                )?;
                let rows = stmt.query_map(params![limit], |row| {
                    Ok(OperationLog {
                        id: row.get(0)?,
                        server_id: row.get(1)?,
                        command: row.get(2)?,
                        risk_level: row.get(3)?,
                        executed_at: row.get(4)?,
                    })
                })?;
                for row in rows {
                    results.push(row?);
                }
            }
        }

        Ok(results)
    }
}
