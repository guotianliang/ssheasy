import { invoke } from "@tauri-apps/api/core";
import type { SessionStatusInfo } from "@/types/terminal";

export const terminalService = {
  connect: (serverId: string, sessionId: string) =>
    invoke<string>("terminal_connect", { serverId, sessionId }),

  execute: (sessionId: string, command: string) => invoke<void>("terminal_execute", { sessionId, command }),

  sendInput: (sessionId: string, data: string) =>
    invoke<void>("terminal_input", { sessionId, data }),

  resize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("terminal_resize", { sessionId, cols, rows }),

  close: (sessionId: string) =>
    invoke<void>("terminal_close", { sessionId }),

  status: (sessionId: string) =>
    invoke<SessionStatusInfo>("terminal_status", { sessionId }),
};
