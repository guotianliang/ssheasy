use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use super::session::{self, ConnectConfig, SessionHandle};
use crate::events;

/// 连接池：管理所有活跃 SSH 会话
pub struct ConnectionManager {
    sessions: HashMap<String, SessionHandle>,
    app_handle: AppHandle,
}

impl ConnectionManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            sessions: HashMap::new(),
            app_handle,
        }
    }

    /// 创建新会话并启动输出监听
    pub async fn create_session(
        &mut self,
        server_id: &str,
        config: &ConnectConfig,
    ) -> Result<String, super::error_translate::TranslatedError> {
        let session_id = uuid::Uuid::new_v4().to_string();

        // 创建输出通道：session task 通过此通道推送终端输出
        let (output_tx, mut output_rx) = mpsc::unbounded_channel::<String>();

        // 建立连接（内部会 spawn I/O task）
        let handle = session::connect(
            session_id.clone(),
            server_id.to_string(),
            config,
            output_tx,
        )
        .await?;

        // 启动输出转发 task：从 output_rx 读取 → emit 到前端
        let app_handle = self.app_handle.clone();
        let sid = session_id.clone();
        tokio::spawn(async move {
            while let Some(data) = output_rx.recv().await {
                let _ = app_handle.emit(
                    events::TERMINAL_OUTPUT,
                    serde_json::json!({
                        "sessionId": sid,
                        "data": data
                    }),
                );
            }
        });

        // 启动心跳检测
        self.spawn_heartbeat(&handle);

        self.sessions.insert(session_id.clone(), handle);

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

    /// 向会话写入数据
    pub fn write(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| "session not found".to_string())?;
        session.write(data)
    }

    /// 调整终端大小
    pub fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<(), String> {
        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| "session not found".to_string())?;
        session.resize(cols, rows)
    }

    /// 关闭会话
    pub fn close_session(&mut self, session_id: &str) {
        if let Some(session) = self.sessions.remove(session_id) {
            // drop SessionHandle 会关闭 mpsc channel，I/O task 自动退出
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

    /// 心跳检测：定期发送空数据，连续失败则通知断线
    fn spawn_heartbeat(&self, handle: &SessionHandle) {
        let app_handle = self.app_handle.clone();
        let session_id = handle.session_id.clone();
        let server_id = handle.server_id.clone();
        let input_tx = handle.input_tx.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
            let mut fail_count = 0u8;

            loop {
                interval.tick().await;
                // 发送空字节作为心跳探测
                match input_tx.send(vec![]) {
                    Ok(_) => fail_count = 0,
                    Err(_) => {
                        fail_count += 1;
                        if fail_count >= 3 {
                            let _ = app_handle.emit(
                                events::CONNECTION_STATUS,
                                serde_json::json!({
                                    "serverId": server_id,
                                    "sessionId": session_id,
                                    "status": "disconnected",
                                    "message": "连接已断开（心跳超时）"
                                }),
                            );
                            break;
                        }
                    }
                }
            }
        });
    }
}
