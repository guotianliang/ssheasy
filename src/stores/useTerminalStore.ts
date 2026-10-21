import { useServerStore } from "./useServerStore";
import { useSftpStore } from "./useSftpStore";
import { create } from "zustand";
import { terminalService } from "@/services/terminalService";
import type { SessionStatusInfo } from "@/types/terminal";

export type SessionStatus = "connecting" | "connected" | "disconnected";

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
    const existing = get().sessions.find((s) => s.serverId === serverId && s.status !== "disconnected");
    if (existing) { set({ activeSessionId: existing.sessionId }); useSftpStore.getState().setViewMode("terminal"); return existing.sessionId; }
    const sessionId = crypto.randomUUID();
    set((s) => ({ sessions: [...s.sessions, { sessionId, serverId, serverName, status: "connecting" }], activeSessionId: sessionId }));
    useServerStore.getState().setConnectionStatus(serverId, "connecting");
    useSftpStore.getState().setViewMode("terminal");
    try {
      await terminalService.connect(serverId, sessionId);
      set((s) => ({ sessions: s.sessions.map((t) => t.sessionId === sessionId && t.status === "connecting" ? { ...t, status: "connected" } : t) }));
      useServerStore.getState().setConnectionStatus(serverId, get().sessions.find((s) => s.sessionId === sessionId)?.status ?? "disconnected");
      return sessionId;
    } catch (e) {
      get().markDisconnected(sessionId, "连接失败，请检查连接配置后重试");
      useServerStore.getState().setConnectionStatus(serverId, "error");
      throw e;
    }
  },

  reconnect: async (sessionId) => {
    const target = get().sessions.find((s) => s.sessionId === sessionId);
    if (!target || target.status === "connecting") return null;
    const connected = await get().connect(target.serverId, target.serverName);
    if (connected !== sessionId && get().sessions.find((s) => s.sessionId === connected)?.status === "connected") await get().close(sessionId);
    return connected;
  },

  close: async (sessionId) => {
    const target = get().sessions.find((s) => s.sessionId === sessionId);
    if (target?.status === "connecting") return;
    await terminalService.close(sessionId);
    set((s) => {
      const sessions = s.sessions.filter((t) => t.sessionId !== sessionId);
      const { [sessionId]: _removed, ...sessionStatuses } = s.sessionStatuses;
      const activeSessionId = s.activeSessionId === sessionId ? sessions[sessions.length - 1]?.sessionId ?? null : s.activeSessionId;
      return { sessions, activeSessionId, sessionStatuses };
    });
    if (target && !get().sessions.some((s) => s.serverId === target.serverId && s.status === "connected")) {
      useServerStore.getState().setConnectionStatus(target.serverId, "disconnected");
      if (useSftpStore.getState().loadedServerId === target.serverId) useSftpStore.getState().reset();
    }
  },

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  markDisconnected: (sessionId, reason) => {
    const target = get().sessions.find((s) => s.sessionId === sessionId);
    set((s) => ({
      sessions: s.sessions.map((t) =>
        t.sessionId === sessionId
          ? { ...t, status: "disconnected", disconnectReason: reason }
          : t
      ),
    }));
    if (target && !get().sessions.some((s) => s.serverId === target.serverId && s.status === "connected")) {
      useServerStore.getState().setConnectionStatus(target.serverId, "disconnected");
      if (useSftpStore.getState().loadedServerId === target.serverId) useSftpStore.getState().reset();
    }
  },

  updateStatus: (sessionId, info) =>
    set((s) => s.sessions.some((t) => t.sessionId === sessionId) ? ({
      sessionStatuses: {
        ...s.sessionStatuses,
        [sessionId]: info,
      },
    }) : s),

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
