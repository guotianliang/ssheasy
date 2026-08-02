import { useEffect, useRef, useCallback, MutableRefObject } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { terminalService } from "@/services/terminalService";
import { ViewSwitch } from "@/components/layout/ViewSwitch";
import type { TerminalOutputEvent } from "@/types/terminal";

interface TerminalPanelProps {
  outputHandlerRef: MutableRefObject<(event: TerminalOutputEvent) => void>;
}

interface TermInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
}

export function TerminalPanel({ outputHandlerRef }: TerminalPanelProps) {
  const { sessions, activeSessionId, setActiveSession, close, reconnect, sessionStatuses, refreshStatus } =
    useTerminalStore();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Map<string, TermInstance>>(new Map());

  const createInstance = useCallback((sessionId: string): TermInstance => {
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.inset = "0";

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      lineHeight: 1.4,
      theme: {
        background: "#0f1115",
        foreground: "#e4e7ee",
        cursor: "#14b8a6",
        selectionBackground: "rgba(20, 184, 166, 0.20)",
        black: "#232733",
        red: "#f87171",
        green: "#34d399",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e4e7ee",
        brightBlack: "#6b7280",
        brightRed: "#fca5a5",
        brightGreen: "#6ee7b7",
        brightYellow: "#fcd34d",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#f3f4f6",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(container);
    fitAddon.fit();

    // 复制粘贴
    terminal.attachCustomKeyEventHandler((e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "c" && terminal.hasSelection()) {
        navigator.clipboard.writeText(terminal.getSelection());
        return false;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        navigator.clipboard.readText().then((text) => terminal.paste(text));
        return false;
      }
      return true;
    });

    terminal.onData((data) => {
      terminalService.sendInput(sessionId, data);
    });

    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (terminal.cols && terminal.rows) {
        terminalService.resize(sessionId, terminal.cols, terminal.rows);
      }
    });
    ro.observe(container);
    (container as any).__ro = ro;

    return { terminal, fitAddon, container };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const instances = instancesRef.current;
    const currentIds = new Set(sessions.map((s) => s.sessionId));

    for (const [id, inst] of instances) {
      if (!currentIds.has(id)) {
        (inst.container as any).__ro?.disconnect();
        inst.terminal.dispose();
        inst.container.remove();
        instances.delete(id);
      }
    }

    for (const session of sessions) {
      if (!instances.has(session.sessionId)) {
        const inst = createInstance(session.sessionId);
        instances.set(session.sessionId, inst);
        wrapper.appendChild(inst.container);
      }
    }

    for (const [id, inst] of instances) {
      inst.container.style.display = id === activeSessionId ? "block" : "none";
    }

    if (activeSessionId) {
      const active = instances.get(activeSessionId);
      if (active) {
        active.fitAddon.fit();
        active.terminal.focus();
      }
    }
  }, [sessions, activeSessionId, createInstance]);

  const handleOutput = useCallback((event: TerminalOutputEvent) => {
    const inst = instancesRef.current.get(event.sessionId);
    if (inst) {
      inst.terminal.write(event.data);
    }
  }, []);

  useEffect(() => {
    outputHandlerRef.current = handleOutput;
  }, [handleOutput, outputHandlerRef]);

  // 切换/新建会话时主动拉一次状态栏（等 shell 提示符出现）
  useEffect(() => {
    if (activeSessionId) {
      const t = setTimeout(() => refreshStatus(activeSessionId), 500);
      return () => clearTimeout(t);
    }
  }, [activeSessionId, refreshStatus]);

  const handleAreaClick = () => {
    if (activeSessionId) {
      instancesRef.current.get(activeSessionId)?.terminal.focus();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab 栏 */}
      {sessions.length > 0 && (
        <div className="flex items-center h-9 border-b border-border-subtle bg-surface flex-shrink-0">
          <div className="flex items-center flex-1 min-w-0 overflow-x-auto px-1">
          {sessions.map((session) => {
            const disconnected = session.status === "disconnected";
            return (
              <div
                key={session.sessionId}
                className={`group flex items-center gap-1.5 px-3 h-full text-helper cursor-pointer border-b-[2px] transition-all duration-150 ${
                  session.sessionId === activeSessionId
                    ? "border-accent text-primary bg-accent-soft"
                    : disconnected
                    ? "border-transparent text-tertiary hover:text-secondary hover:bg-elevated"
                    : "border-transparent text-tertiary hover:text-secondary hover:bg-elevated"
                }`}
                onClick={() => setActiveSession(session.sessionId)}
                title={disconnected ? session.disconnectReason || "连接已断开" : undefined}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    disconnected ? "bg-danger" : "bg-success"
                  }`}
                />
                <span className="max-w-[100px] truncate">{session.serverName}</span>
                {disconnected && (
                  <button
                    className="ml-0.5 w-4 h-4 rounded flex items-center justify-center text-tertiary hover:text-accent hover:bg-accent-soft transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      reconnect(session.sessionId);
                    }}
                    title="重新连接"
                  >
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M10 6a4 4 0 1 1-1.2-2.85M10 1.5v2.4H7.6"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
                <button
                  className="opacity-0 group-hover:opacity-100 ml-0.5 w-4 h-4 rounded flex items-center justify-center text-disabled hover:text-danger hover:bg-danger-soft transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    close(session.sessionId);
                  }}
                  title="关闭"
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            );
          })}
          </div>
          <div className="flex-shrink-0 px-2">
            <ViewSwitch />
          </div>
        </div>
      )}

      {/* 终端区域 */}
      <div className="flex-1 relative min-h-0" onClick={handleAreaClick}>
        <div ref={wrapperRef} className="absolute inset-0" />
        {sessions.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-elevated border border-border-subtle flex items-center justify-center shadow-lg shadow-black/20">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-tertiary">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </div>
              <div className="text-body text-secondary mb-1">选择左侧服务器开始连接</div>
              <div className="text-label text-disabled">连接后可使用右侧快捷命令面板</div>
            </div>
          </div>
        )}

        {/* 断线覆盖层 */}
        {(() => {
          const active = sessions.find((s) => s.sessionId === activeSessionId);
          if (!active || active.status !== "disconnected") return null;
          return (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-base/85 backdrop-blur-[1px] animate-fade-in">
              <div className="text-center max-w-xs px-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-danger-soft border border-danger/20 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </div>
                <div className="text-body text-primary mb-1">连接已断开</div>
                {active.disconnectReason && (
                  <div className="text-label text-tertiary mb-3">{active.disconnectReason}</div>
                )}
                <button
                  className="mt-2 px-4 py-1.5 rounded-lg text-helper font-medium text-white bg-accent hover:bg-accent-hover transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    reconnect(active.sessionId);
                  }}
                >
                  重新连接
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 状态栏 */}
      {(() => {
        const active = sessions.find((s) => s.sessionId === activeSessionId);
        if (!active || active.status !== "connected") return null;
        const info = sessionStatuses[active.sessionId];
        const label = info && (info.user || info.host || info.cwd)
          ? `${info.user}@${info.host}${info.cwd ? ":" + info.cwd : ""}`
          : `${active.serverName} · 已连接`;
        return (
          <div className="flex items-center gap-2 px-3 h-6 border-t border-border-subtle bg-surface flex-shrink-0 text-label text-tertiary select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
            <span className="font-mono truncate">{label}</span>
            <button
              className="ml-auto text-disabled hover:text-accent transition-colors"
              onClick={() => refreshStatus(active.sessionId)}
              title="刷新状态"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M10 6a4 4 0 1 1-1.2-2.85M10 1.5v2.4H7.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        );
      })()}
    </div>
  );
}
