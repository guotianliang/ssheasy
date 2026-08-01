import { useEffect } from "react";
import { useLogStore } from "@/stores/useLogStore";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useServerStore } from "@/stores/useServerStore";

const RISK_STYLE: Record<string, { label: string; color: string }> = {
  high: { label: "高危", color: "var(--danger)" },
  medium: { label: "中危", color: "var(--warning)" },
  low: { label: "低危", color: "var(--success)" },
};

export function LogPanel() {
  const { logs, loading, fetch } = useLogStore();
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const servers = useServerStore((s) => s.servers);

  const activeServerId = sessions.find((s) => s.sessionId === activeSessionId)?.serverId;

  useEffect(() => {
    fetch(activeServerId);
  }, [activeServerId, fetch]);

  const serverName = (sid: string) =>
    servers.find((s) => s.id === sid)?.name ||
    sessions.find((s) => s.serverId === sid)?.serverName ||
    sid;

  return (
    <div className="flex flex-col h-full bg-base">
      <div className="flex items-center justify-between px-3 h-9 border-b border-border-subtle flex-shrink-0">
        <span className="text-helper font-medium text-secondary">操作审计日志</span>
        <button
          className="text-label text-tertiary hover:text-accent transition-colors"
          onClick={() => fetch(activeServerId)}
        >
          刷新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {loading && logs.length === 0 && (
          <div className="text-center text-helper text-tertiary py-8">加载中...</div>
        )}
        {!loading && logs.length === 0 && (
          <div className="text-center text-helper text-tertiary py-8">
            暂无操作记录
            <div className="text-label text-disabled mt-1">通过右侧「快捷命令 ▶ 直接执行」会在此留痕</div>
          </div>
        )}
        {logs.map((log) => {
          const risk = RISK_STYLE[log.riskLevel] ?? RISK_STYLE.low;
          return (
            <div
              key={log.id}
              className="rounded-md px-2.5 py-2 bg-surface border border-border-subtle"
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-label px-1.5 py-0.5 rounded font-medium"
                  style={{ color: risk.color, background: "var(--bg-elevated)" }}
                >
                  {risk.label}
                </span>
                <span className="text-label text-tertiary">{serverName(log.serverId)}</span>
                <span className="text-label text-disabled ml-auto">{log.executedAt}</span>
              </div>
              <div className="text-helper font-mono text-secondary break-all">{log.command}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
