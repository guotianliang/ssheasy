use tauri::State;

use crate::ssh::hostkey::HostKeyDecision;
use crate::AppState;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyDecisionInput {
    /// 与 HOSTKEY_VERIFY 事件中携带的 token 对应
    pub token: String,
    /// "accept-and-save" | "accept-once" | "reject"
    pub decision: String,
}

/// 前端在 HOSTKEY_VERIFY 弹窗中作出决策后，回调此命令把结果送回等待中的 SSH 连接。
#[tauri::command]
pub async fn host_key_decision(
    state: State<'_, AppState>,
    input: HostKeyDecisionInput,
) -> Result<(), String> {
    let decision = match input.decision.as_str() {
        "accept-and-save" => HostKeyDecision::AcceptAndSave,
        "accept-once" => HostKeyDecision::AcceptOnce,
        "reject" => HostKeyDecision::Reject,
        other => return Err(format!("未知的决策类型: {}", other)),
    };

    // 取出该 token 对应的 oneshot 发送端；取走即删除，避免堆积
    let tx = {
        let mut map = state.hostkey_pending.lock().await;
        map.remove(&input.token)
    };

    match tx {
        Some(tx) => {
            // 若对端已超时丢弃接收端，send 会返回 Err，忽略即可
            let _ = tx.send(decision);
            Ok(())
        }
        None => Err(format!(
            "未找到对应的 Host Key 验证请求（可能已超时）: {}",
            input.token
        )),
    }
}
