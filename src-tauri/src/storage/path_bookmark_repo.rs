use rusqlite::params;
use serde::{Deserialize, Serialize};

use super::database::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathBookmark {
    pub id: String,
    pub server_id: String,
    pub path: String,
    pub label: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathBookmarkInput {
    pub server_id: String,
    pub path: String,
    pub label: Option<String>,
}

impl Database {
    pub fn list_path_bookmarks(&self, server_id: &str) -> Result<Vec<PathBookmark>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, server_id, path, label, sort_order, created_at FROM path_bookmarks WHERE server_id = ?1 ORDER BY sort_order, created_at DESC",
        )?;
        let rows = stmt.query_map(params![server_id], |row| {
            Ok(PathBookmark {
                id: row.get(0)?,
                server_id: row.get(1)?,
                path: row.get(2)?,
                label: row.get(3)?,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn insert_path_bookmark(&self, input: &PathBookmarkInput) -> Result<PathBookmark, rusqlite::Error> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        self.conn.execute(
            "INSERT INTO path_bookmarks (id, server_id, path, label, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, 0, ?5)",
            params![id, input.server_id, input.path, input.label, now],
        )?;
        Ok(PathBookmark {
            id,
            server_id: input.server_id.clone(),
            path: input.path.clone(),
            label: input.label.clone(),
            sort_order: 0,
            created_at: now,
        })
    }

    pub fn delete_path_bookmark(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn
            .execute("DELETE FROM path_bookmarks WHERE id = ?1", params![id])?;
        Ok(())
    }
}
