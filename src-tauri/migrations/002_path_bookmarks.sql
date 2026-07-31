-- 路径书签：按服务器隔离，收藏常用目录，点击即可 cd 进入
CREATE TABLE IF NOT EXISTS path_bookmarks (
    id          TEXT PRIMARY KEY,
    server_id   TEXT NOT NULL,
    path        TEXT NOT NULL,
    label       TEXT,
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_path_bookmarks_server ON path_bookmarks(server_id);
