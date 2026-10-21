use crate::{storage::database::Database, AppState};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub font_size: u16,
    pub scrollback: u32,
    pub theme: String,
    pub cursor_style: String,
    pub log_retention_days: u16,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            font_size: 14,
            scrollback: 5000,
            theme: "light".into(),
            cursor_style: "bar".into(),
            log_retention_days: 30,
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if !(10..=24).contains(&self.font_size)
            || !(1000..=50000).contains(&self.scrollback)
            || !matches!(self.theme.as_str(), "dark" | "light")
            || !matches!(self.cursor_style.as_str(), "bar" | "block" | "underline")
            || !(1..=365).contains(&self.log_retention_days)
        {
            return Err("设置值超出允许范围".into());
        }
        Ok(())
    }
}
impl Database {
    pub fn load_settings(&self) -> Result<Settings, String> {
        use rusqlite::OptionalExtension;
        let value: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM app_settings WHERE key='preferences'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let settings: Settings = value
            .map(|v| serde_json::from_str(&v))
            .transpose()
            .map_err(|e| e.to_string())?
            .unwrap_or_default();
        settings.validate()?;
        Ok(settings)
    }
    pub fn save_settings(&self, settings: &Settings) -> Result<(), String> {
        settings.validate()?;
        let value = serde_json::to_string(settings).map_err(|e| e.to_string())?;
        self.conn.execute("INSERT INTO app_settings(key,value) VALUES ('preferences',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [value])
            .map_err(|e| e.to_string())?;
        self.prune_logs(settings.log_retention_days)
    }
    pub fn prune_logs(&self, days: u16) -> Result<(), String> {
        let cutoff = (chrono::Utc::now() - chrono::Duration::days(days as i64))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        for table in ["logs", "recent_commands"] {
            self.conn
                .execute(
                    &format!("DELETE FROM {table} WHERE executed_at < ?1"),
                    [&cutoff],
                )
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}
#[tauri::command]
pub async fn settings_get(state: State<'_, AppState>) -> Result<Settings, String> {
    state.db.lock().await.load_settings()
}
#[tauri::command]
pub async fn settings_save(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    state.db.lock().await.save_settings(&settings)
}
#[tauri::command]
pub async fn logs_clear(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.conn
        .execute_batch("BEGIN; DELETE FROM logs; DELETE FROM recent_commands; COMMIT;")
        .map_err(|e| e.to_string())
}
