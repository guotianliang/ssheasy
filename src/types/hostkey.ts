/** Host Key 验证事件载荷（与 Rust 侧 HOSTKEY_VERIFY 事件对应） */
export interface HostKeyVerifyEvent {
  /** 一次性 token，回调决策时需原样带回 */
  token: string;
  host: string;
  port: number;
  /** SHA256 指纹，形如 SHA256:xxxx */
  fingerprint: string;
  /** "new" 首次连接；"changed" 指纹与已记录的不匹配（疑似中间人） */
  action: "new" | "changed";
}

/** 用户对未知/变更 host key 的决策，对应 Rust 侧 HostKeyDecision */
export type HostKeyDecision = "accept-and-save" | "accept-once" | "reject";
