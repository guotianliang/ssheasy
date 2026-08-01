import { invoke } from "@tauri-apps/api/core";
import type { OperationLog } from "@/types/log";

export const logService = {
  /** 记录一次运维操作（快捷命令直接执行时调用） */
  operation: (serverId: string, command: string) =>
    invoke<void>("log_operation", { serverId, command }),

  /** 查询操作日志，serverId 为空则返回全部服务器的日志 */
  list: (serverId?: string, limit?: number) =>
    invoke<OperationLog[]>("list_logs", {
      serverId: serverId ?? null,
      limit: limit ?? null,
    }),
};
