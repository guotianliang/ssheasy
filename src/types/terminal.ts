export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

export interface ConnectionStatusEvent {
  serverId: string;
  sessionId?: string;
  status: "connected" | "disconnected";
  message?: string;
}

export interface ConnectionErrorEvent {
  serverId: string;
  error: {
    code: string;
    humanMsg: string;
    detail: string;
    suggestions: string[];
  };
}
