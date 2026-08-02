-- 最近使用的命令：按服务器记录最近执行过的命令，用于「最近使用」分组
CREATE TABLE IF NOT EXISTS recent_commands (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id   TEXT NOT NULL,
    command     TEXT NOT NULL,
    executed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recent_commands_server ON recent_commands(server_id);
CREATE INDEX IF NOT EXISTS idx_recent_commands_time ON recent_commands(executed_at);
