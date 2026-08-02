use rusqlite::Connection;
use std::path::Path;

pub struct Database {
    pub conn: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), rusqlite::Error> {
        // 迁移版本表：记录已执行到的最高版本号
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);",
        )?;
        let current: i64 = self
            .conn
            .query_row(
                "SELECT MAX(version) FROM schema_version",
                [],
                |row| row.get::<usize, i64>(0),
            )
            .unwrap_or(0);

        const MIGRATIONS: &[&str] = &[
            include_str!("../../migrations/001_init.sql"),
            include_str!("../../migrations/002_path_bookmarks.sql"),
            include_str!("../../migrations/003_recent_commands.sql"),
        ];

        for (i, sql) in MIGRATIONS.iter().enumerate() {
            let target = (i + 1) as i64;
            if current < target {
                self.conn.execute_batch(sql)?;
                self.conn.execute_batch(&format!(
                    "INSERT INTO schema_version (version) VALUES ({target})"
                ))?;
            }
        }
        Ok(())
    }
}
