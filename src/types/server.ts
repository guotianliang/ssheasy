export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "key";
  keyPath?: string;
  groupName: string;
  color?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServerInput {
  name: string;
  host: string;
  port?: number;
  username?: string;
  authType: "password" | "key";
  keyPath?: string;
  groupName?: string;
  color?: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface TestResult {
  success: boolean;
  error?: TranslatedError;
}

export interface TranslatedError {
  code: string;
  humanMsg: string;
  detail: string;
  suggestions: string[];
}
