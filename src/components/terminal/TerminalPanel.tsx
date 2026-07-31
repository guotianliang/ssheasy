import { useEffect, useRef, useCallback, MutableRefObject } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { terminalService } from "@/services/terminalService";
import type { TerminalOutputEvent } from "@/types/terminal";

interface TerminalPanelProps {
  outputHandlerRef: MutableRefObject<(event: TerminalOutputEvent) => void>;
}

/** 每个 session 的终端实例缓存 */
interface TermInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
}

export function TerminalPanel({ outputHandlerRef }: TerminalPanelProps) {
  const { sessions, activeSessionId, setActiveSession, close, reconnect } = useTerminalStore();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Map<string, TermInstance>>(new Map());

  // 创建终端实例
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
        background: "#0a0a0f",
        foreground: "#e2e8f0",
        cursor: "#6366f1",
        selectionBackground: "#6366f133",
        black: "#1a1b26",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#c0caf5",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(container);
    fitAddon.fit();

    // 用户输入 → 后端
    terminal.onData((data) => {
      terminalService.sendInput(sessionId, data);
    });

    // resize 监听
    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (terminal.cols && terminal.rows) {
        terminalService.resize(sessionId, terminal.cols, terminal.rows);
      }
    });
    ro.observe(container);

    // 存到 dataset 方便清理
    (container as any).__ro = ro;

    return { terminal, fitAddon, container };
  }, []);

  // 同步 session 列表 → 终端实例
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const instances = instancesRef.current;
    const currentIds = new Set(sessions.map((s) => s.sessionId));

    // 移除已关闭的 session 对应的实例
    for (const [id, inst] of instances) {
      if (!currentIds.has(id)) {
        (inst.container as any).__ro?.disconnect();
        inst.terminal.dispose();
        inst.container.remove();
        instances.delete(id);
      }
    }

    // 新增缺失的实例
    for (const session of sessions) {
      if (!instances.has(session.sessionId)) {
        const inst = createInstance(session.sessionId);
        instances.set(session.sessionId, inst);
        wrapper.appendChild(inst.container);
      }
    }

    // 显示/隐藏
    for (const [id, inst] of instances) {
      inst.container.style.display = id === activeSessionId ? "block" : "none";
    }

    // 激活当前终端
    if (activeSessionId) {
      const active = instances.get(activeSessionId);
      if (active) {
        active.fitAddon.fit();
        active.terminal.focus();
      }
    }
  }, [sessions, activeSessionId, createInstance]);

  // 输出分发：写入对应 session 的终端
  const handleOutput = useCallback((event: TerminalOutputEvent) => {
    const inst = instancesRef.current.get(event.sessionId);
    if (inst) {
      inst.terminal.write(event.data);
    }
  }, []);

  useEffect(() => {
    outputHandlerRef.current = handleOutput;
  }, [handleOutput, outputHandlerRef]);

  // 点击区域聚焦当前终端
  const handleAreaClick = () => {
    if (activeSessionId) {
      instancesRef.current.get(activeSessionId)?.terminal.focus();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab 栏 */}
      {sessions.length > 0 && (
        <div className="flex items-center h-9 border-b border-[#1a1a24] bg-[#0e0e15] px-1 overflow-x-auto flex-shrink-0">
          {sessions.map((session) => {
            const disconnected = session.status === "disconnected";
            return (
              <div
                key={session.sessionId}
                className={`group flex items-center gap-1.5 px-3 h-full text-[11px] cursor-pointer border-b-[1.5px] transition-all duration-150 ${
                  session.sessionId === activeSessionId
                    ? "border-indigo-500 text-gray-200 bg-white/[0.02]"
                    : "border-transparent text-gray-600 hover:text-gray-400 hover:bg-white/[0.01]"
                }`}
                onClick={() => setActiveSession(session.sessionId)}
                title={disconnected ? session.disconnectReason || "连接已断开" : undefined}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    disconnected ? "bg-gray-600" : "bg-emerald-400"
                  }`}
                />
                <span className="max-w-[100px] truncate">{session.serverName}</span>
                {disconnected && (
                  <button
                    className="ml-0.5 w-4 h-4 rounded flex items-center justify-center text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
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
                  className="opacity-0 group-hover:opacity-100 ml-0.5 w-4 h-4 rounded flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
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
      )}

      {/* 终端区域 */}
      <div className="flex-1 relative min-h-0" onClick={handleAreaClick}>
        <div ref={wrapperRef} className="absolute inset-0" />
        {sessions.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#12121a] border border-[#1e1e2a] flex items-center justify-center shadow-lg shadow-black/20">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3f3f5a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </div>
              <div className="text-[12px] text-gray-500 mb-1">选择左侧服务器开始连接</div>
              <div className="text-[10px] text-gray-700">连接后可使用右侧快捷命令面板</div>
            </div>
          </div>
        )}

        {/* 当前 tab 已断线 → 覆盖层提示重连 */}
        {(() => {
          const active = sessions.find((s) => s.sessionId === activeSessionId);
          if (!active || active.status !== "disconnected") return null;
          return (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0a0f]/85 backdrop-blur-[1px] animate-fade-in">
              <div className="text-center max-w-xs px-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </div>
                <div className="text-[12px] text-gray-300 mb-1">连接已断开</div>
                {active.disconnectReason && (
                  <div className="text-[10px] text-gray-600 mb-3">{active.disconnectReason}</div>
                )}
                <button
                  className="mt-2 px-4 py-1.5 rounded-lg text-[11px] font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
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
    </div>
  );
}
