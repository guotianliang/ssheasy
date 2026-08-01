import { invoke } from "@tauri-apps/api/core";
import type { HostKeyDecision } from "@/types/hostkey";

export const hostkeyService = {
  /** 将用户对 Host Key 的决策回传给后端，唤醒等待中的 SSH 连接 */
  decide: (token: string, decision: HostKeyDecision) =>
    invoke<void>("host_key_decision", { input: { token, decision } }),
};
