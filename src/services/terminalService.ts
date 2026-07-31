import { invoke } from "@tauri-apps/api/core";

export const terminalService = {
  connect: (serverId: string) =>
    invoke<string>("terminal_connect", { serverId }),

  sendInput: (sessionId: string, data: string) =>
    invoke<void>("terminal_input", { sessionId, data }),

  resize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("terminal_resize", { sessionId, cols, rows }),

  close: (sessionId: string) =>
    invoke<void>("terminal_close", { sessionId }),
};
