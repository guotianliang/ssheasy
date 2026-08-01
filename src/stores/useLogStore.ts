import { create } from "zustand";
import { logService } from "@/services/logService";
import type { OperationLog } from "@/types/log";

interface LogState {
  logs: OperationLog[];
  loading: boolean;
  error: string | null;
  /** 拉取日志，serverId 为空表示全部服务器 */
  fetch: (serverId?: string) => Promise<void>;
  /** 记录一次操作并刷新列表 */
  record: (serverId: string, command: string) => Promise<void>;
}

export const useLogStore = create<LogState>((set) => ({
  logs: [],
  loading: false,
  error: null,

  fetch: async (serverId) => {
    set({ loading: true, error: null });
    try {
      const logs = await logService.list(serverId, 300);
      set({ logs, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  record: async (serverId, command) => {
    try {
      await logService.operation(serverId, command);
    } catch (e) {
      // 记录失败不应影响主流程
      console.error("记录操作日志失败", e);
    }
  },
}));
