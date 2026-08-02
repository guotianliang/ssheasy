import { create } from "zustand";
import { terminalService } from "@/services/terminalService";
import type { SessionStatusInfo } from "@/types/terminal";

export type SessionStatus = "connected" | "disconnected";

interface TerminalSession {
  sessionId: string;
  serverId: string;
  serverName: string;
  status: SessionStatus;
  disconnectReason?: string;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  /** 各会话的状态栏信息（user@host:路径） */
  sessionStatuses: Record<string, SessionStatusInfo>;

  connect: (serverId: string, serverName: string) => Promise<string>;
  reconnect: (sessionId: string) => Promise<string | null>;
  close: (sessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string) => void;
  markDisconnected: (sessionId: string, reason?: string) => void;
  updateStatus: (sessionId: string, info: SessionStatusInfo) => void;
  refreshStatus: (sessionId: string) => Promise<void>;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  sessionStatuses: {},

  connect: async (serverId, serverName) => {
    const sessionId = await terminalService.connect(serverId);
    const session: TerminalSession = {
      sessionId,
      serverId,
      serverName,
      status: "connected",
    };
    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionId: sessionId,
    }));
    return sessionId;
  },

  reconnect: async (sessionId) => {
    const target = get().sessions.find((s) => s.sessionId === sessionId);
    if (!target) return null;
    // 先关闭旧 session（清理后端资源 + 移除 tab）
    await get().close(sessionId);
    // 重新连接到同一台服务器
    try {
      return await get().connect(target.serverId, target.serverName);
    } catch (e) {
      console.error("Reconnect failed:", e);
      return null;
    }
  },

  close: async (sessionId) => {
    await terminalService.close(sessionId);
    set((s) => {
      const sessions = s.sessions.filter((t) => t.sessionId !== sessionId);
      const activeSessionId =
        s.activeSessionId === sessionId
          ? sessions[sessions.length - 1]?.sessionId ?? null
          : s.activeSessionId;
      return { sessions, activeSessionId };
    });
  },

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  markDisconnected: (sessionId, reason) =>
    set((s) => ({
      sessions: s.sessions.map((t) =>
        t.sessionId === sessionId
          ? { ...t, status: "disconnected", disconnectReason: reason }
          : t
      ),
    })),

  updateStatus: (sessionId, info) =>
    set((s) => ({
      sessionStatuses: {
        ...s.sessionStatuses,
        [sessionId]: info,
      },
    })),

  refreshStatus: async (sessionId) => {
    try {
      const info = await terminalService.status(sessionId);
      if (info.user || info.host || info.cwd) {
        get().updateStatus(sessionId, info);
      }
    } catch {
      // 状态查询失败静默忽略
    }
  },
}));
