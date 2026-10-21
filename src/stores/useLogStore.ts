import { create } from "zustand";
import { logService } from "@/services/logService";
import type { OperationLog } from "@/types/log";

interface LogState {
  logs: OperationLog[];
  loading: boolean;
  error: string | null;
  /** 拉取日志，serverId 为空表示全部服务器 */
  fetch: (serverId?: string) => Promise<void>;
}

let requestId = 0;
export const useLogStore = create<LogState>((set) => ({
  logs: [],
  loading: false,
  error: null,

  fetch: async (serverId) => {
    const request = ++requestId;
    set({ loading: true, error: null, logs: [] });
    try {
      const logs = await logService.list(serverId, 300);
      if (request === requestId) set({ logs, loading: false });
    } catch (e) {
      if (request === requestId) set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

}));
