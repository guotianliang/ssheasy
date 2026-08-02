export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

/** 状态栏信息（user@host:路径） */
export interface SessionStatusInfo {
  user: string;
  host: string;
  cwd: string;
}

export interface SessionStatusEvent {
  sessionId: string;
  info: SessionStatusInfo;
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
