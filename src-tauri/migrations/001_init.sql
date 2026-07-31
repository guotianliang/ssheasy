CREATE TABLE IF NOT EXISTS servers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    host        TEXT NOT NULL,
    port        INTEGER DEFAULT 22,
    username    TEXT NOT NULL DEFAULT 'root',
    auth_type   TEXT NOT NULL DEFAULT 'password',
    key_path    TEXT,
    group_name  TEXT DEFAULT '默认分组',
    color       TEXT,
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commands (
    id          TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    cmd         TEXT NOT NULL,
    description TEXT,
    is_builtin  INTEGER DEFAULT 0,
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id   TEXT NOT NULL,
    command     TEXT NOT NULL,
    risk_level  TEXT DEFAULT 'safe',
    executed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_logs_server ON logs(server_id);
CREATE INDEX IF NOT EXISTS idx_commands_category ON commands(category);
