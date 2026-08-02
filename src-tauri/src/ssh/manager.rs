use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};

use super::session::{self, ConnectConfig, SessionHandle, SessionStatusInfo};
use crate::events;

/// 连接池：管理所有活跃 SSH 会话
/// sessions 使用内部 Mutex：create_session 的 SSH 握手（可能 5~30s）在锁外进行，
/// 避免一个终端连接时阻塞其他终端的 input/resize/close。
pub struct ConnectionManager {
    sessions: Mutex<HashMap<String, SessionHandle>>,
    app_handle: AppHandle,
}

impl ConnectionManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            app_handle,
        }
    }

    /// 创建新会话并启动输出监听。
    /// SSH 握手全程不持有 sessions 锁；仅在建连成功后短暂加锁注册。
    pub async fn create_session(
        &self,
        server_id: &str,
        config: &ConnectConfig,
    ) -> Result<String, super::error_translate::TranslatedError> {
        let session_id = uuid::Uuid::new_v4().to_string();

        // 创建输出通道：session task 通过此通道推送终端输出（原始字节）
        let (output_tx, mut output_rx) = mpsc::unbounded_channel::<Vec<u8>>();

        // ── 锁外建立连接（内部会 spawn I/O task）──
        let mut handle = session::connect(
            self.app_handle.clone(),
            session_id.clone(),
            server_id.to_string(),
            config,
            output_tx,
            true,
        )
        .await?;

        // 启动输出转发 task：从 output_rx 读取（原始字节）→ base64 → emit 到前端
        let app_handle = self.app_handle.clone();
        let sid = session_id.clone();
        tokio::spawn(async move {
            use base64::Engine;
            while let Some(data) = output_rx.recv().await {
                let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                let _ = app_handle.emit(
                    events::TERMINAL_OUTPUT,
                    serde_json::json!({
                        "sessionId": sid,
                        "data": b64
                    }),
                );
            }
        });

        // 启动状态栏推送 task：监听 status 变化 → emit 到前端
        let app_handle2 = self.app_handle.clone();
        let sid2 = session_id.clone();
        let mut status_rx = handle.status_rx.take().unwrap(); // 从 handle 取出 receiver
        tokio::spawn(async move {
            while let Some(info) = status_rx.recv().await {
                let _ = app_handle2.emit(
                    events::SESSION_STATUS,
                    serde_json::json!({
                        "sessionId": sid2,
                        "info": info
                    }),
                );
            }
        });

        // ── 建连成功，短暂加锁注册 ──
        self.sessions.lock().await.insert(session_id.clone(), handle);

        // 通知前端连接成功
        let _ = self.app_handle.emit(
            events::CONNECTION_STATUS,
            serde_json::json!({
                "serverId": server_id,
                "sessionId": session_id,
                "status": "connected"
            }),
        );

        Ok(session_id)
    }

    /// 查询会话当前状态（状态栏用）
    pub async fn get_status(&self, session_id: &str) -> Result<SessionStatusInfo, String> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| "session not found".to_string())?;
        // 直接返回 I/O task 实时维护的快照（不发送任何假探测，避免状态栏被空值覆盖）
        let guard = session.status.try_lock();
        match guard {
            Ok(g) => Ok(g.clone()),
            Err(_) => Ok(SessionStatusInfo {
                user: String::new(),
                host: String::new(),
                cwd: String::new(),
            }),
        }
    }

    /// 向会话写入数据
    pub async fn write(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| "session not found".to_string())?;
        session.write(data)
    }

    /// 调整终端大小
    pub async fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<(), String> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| "session not found".to_string())?;
        session.resize(cols, rows)
    }

    /// 关闭会话
    pub async fn close_session(&self, session_id: &str) {
        let removed = self.sessions.lock().await.remove(session_id);
        if let Some(session) = removed {
            // 发送关断信号：I/O 循环收到后退出并向 russh 发送 disconnect，真正释放 SSH 连接
            let _ = session.shutdown.send(true);
            drop(session);
            let _ = self.app_handle.emit(
                events::CONNECTION_STATUS,
                serde_json::json!({
                    "sessionId": session_id,
                    "status": "disconnected"
                }),
            );
        }
    }

    /// 获取会话所属的 server_id（用于联动清理 SFTP 会话）
    pub async fn session_server_id(&self, session_id: &str) -> Option<String> {
        self.sessions
            .lock()
            .await
            .get(session_id)
            .map(|s| s.server_id.clone())
    }
}
