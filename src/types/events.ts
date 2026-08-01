/** 事件名常量，与 Rust 侧 events.rs 保持一致 */
export const EVENTS = {
  TERMINAL_OUTPUT: "terminal:output",
  CONNECTION_STATUS: "connection:status",
  CONNECTION_ERROR: "connection:error",
  HOSTKEY_VERIFY: "hostkey:verify",
} as const;
