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

/** 判断字符串是否为合法主机地址：IPv4 / IPv6 / 域名（与后端校验保持一致） */
export function isValidHost(host: string): boolean {
  const h = host.trim();
  if (!h) return false;
  // IPv4 / IPv6
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) {
    return h.split(".").every((p) => {
      const n = Number(p);
      return Number.isInteger(n) && n >= 0 && n <= 255;
    });
  }
  if (h.includes(":")) {
    // 简单判断 IPv6：含冒号且每段为 1-4 位十六进制
    return h.split(":").every((p) => p === "" || /^[0-9a-fA-F]{1,4}$/.test(p));
  }
  // 域名：以 . 分隔的标签，每段仅含字母/数字/连字符，不以连字符开头或结尾
  const labels = h.split(".");
  return (
    labels.length > 0 &&
    labels.every(
      (label) =>
        label.length > 0 &&
        !label.startsWith("-") &&
        !label.endsWith("-") &&
        [...label].every((c) => /[a-zA-Z0-9-]/.test(c))
    )
  );
}
