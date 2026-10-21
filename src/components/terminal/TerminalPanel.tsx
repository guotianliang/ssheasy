import { useEffect, useRef, useCallback, useState, MutableRefObject } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { terminalService } from "@/services/terminalService";
import { SearchAddon } from "@xterm/addon-search";
import { open } from "@tauri-apps/plugin-shell";
import { reportError, runAction } from "@/lib/errors";
import { useSftpStore } from "@/stores/useSftpStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { TerminalOutputEvent } from "@/types/terminal";

interface TerminalPanelProps {
  outputHandlerRef: MutableRefObject<(event: TerminalOutputEvent) => void>;
}

interface TermInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
  searchAddon: SearchAddon;
  observer: ResizeObserver;
}

function terminalTheme(theme: "dark" | "light"): ITheme {
  return theme === "light" ? {
    background: "#f6f8fb", foreground: "#172438", cursor: "#0d9488", selectionBackground: "#b2e4df",
    black: "#172438", red: "#b82937", green: "#16734b", yellow: "#896100", blue: "#2456b8", magenta: "#863597", cyan: "#00777f", white: "#46556a",
    brightBlack: "#65748b", brightRed: "#c43742", brightGreen: "#14754d", brightYellow: "#8d6500", brightBlue: "#255ac5", brightMagenta: "#913fa2", brightCyan: "#007b83", brightWhite: "#34455d",
  } : {
    background: "#0f1115", foreground: "#e4e7ee", cursor: "#14b8a6", selectionBackground: "#164843",
    black: "#78879d", red: "#f87171", green: "#34d399", yellow: "#fbbf24", blue: "#60a5fa", magenta: "#c084fc", cyan: "#22d3ee", white: "#e4e7ee",
    brightBlack: "#9caac0", brightRed: "#fca5a5", brightGreen: "#6ee7b7", brightYellow: "#fcd34d", brightBlue: "#93c5fd", brightMagenta: "#d8b4fe", brightCyan: "#67e8f9", brightWhite: "#f3f4f6",
  };
}

export function TerminalPanel({ outputHandlerRef }: TerminalPanelProps) {
  const { sessions, activeSessionId, setActiveSession, close, reconnect, sessionStatuses, refreshStatus } =
    useTerminalStore();
  const settings = useSettingsStore((s) => s.settings);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFound, setSearchFound] = useState(true);
  const pendingOutputRef = useRef(new Map<string, string[]>());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Map<string, TermInstance>>(new Map());

  const createInstance = useCallback((sessionId: string): TermInstance => {
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.inset = "8px 12px";

    wrapperRef.current?.appendChild(container);
    const preferences = useSettingsStore.getState().settings;
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: preferences.cursorStyle,
      fontSize: preferences.fontSize,
      scrollback: preferences.scrollback,
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      lineHeight: 1.4,
      theme: terminalTheme(preferences.theme),
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon((_event, uri) => { if (/^https?:\/\//i.test(uri)) open(uri).catch(reportError); }));
    const searchAddon = new SearchAddon();
    terminal.loadAddon(searchAddon);
    terminal.open(container);
    fitAddon.fit();

    // xterm handles native copy/paste events synchronously through clipboardData.
    // Async Clipboard API reads are denied by WKWebView and can race native paste.

    terminal.onData((data) => {
      if (useTerminalStore.getState().sessions.find((s) => s.sessionId === sessionId)?.status === "connected") {
        terminalService.sendInput(sessionId, data).catch(reportError);
      }
    });

    const ro = new ResizeObserver(() => {
      if (!container.offsetWidth || !container.offsetHeight) return;
      fitAddon.fit();
      if (terminal.cols && terminal.rows) {
        terminalService.resize(sessionId, terminal.cols, terminal.rows).catch(() => {});
      }
    });
    ro.observe(container);
    return { terminal, fitAddon, container, searchAddon, observer: ro };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const instances = instancesRef.current;
    const currentIds = new Set(sessions.map((s) => s.sessionId));

    for (const [id, inst] of instances) {
      if (!currentIds.has(id)) {
        inst.observer.disconnect();
        inst.terminal.dispose();
        inst.container.remove();
        instances.delete(id);
      }
    }

    for (const session of sessions) {
      if (!instances.has(session.sessionId)) {
        const inst = createInstance(session.sessionId);
        instances.set(session.sessionId, inst);
        for (const data of pendingOutputRef.current.get(session.sessionId) ?? []) {
          inst.terminal.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
        }
        pendingOutputRef.current.delete(session.sessionId);
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
    if (!inst) {
      if (!useTerminalStore.getState().sessions.some((s) => s.sessionId === event.sessionId)) return;
      const pending = pendingOutputRef.current;
      const chunks = pending.get(event.sessionId) ?? [];
      chunks.push(event.data);
      pending.set(event.sessionId, chunks.slice(-128));
      return;
    }
    try {
      // 后端发来 base64 编码的原始字节 → 解码为 Uint8Array 写入 xterm
      const binary = atob(event.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      inst.terminal.write(bytes);
    } catch {
      // base64 解码失败时降级为原样字符串写入，避免终端崩溃
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

  useEffect(() => () => {
    for (const inst of instancesRef.current.values()) { inst.observer.disconnect(); inst.terminal.dispose(); inst.container.remove(); }
    instancesRef.current.clear();
    pendingOutputRef.current.clear();
  }, []);

  useEffect(() => {
    for (const [id, inst] of instancesRef.current) {
      inst.terminal.options.fontSize = settings.fontSize;
      inst.terminal.options.scrollback = settings.scrollback;
      inst.terminal.options.cursorStyle = settings.cursorStyle;
      inst.terminal.options.theme = terminalTheme(settings.theme);
      if (inst.container.offsetWidth) {
        inst.fitAddon.fit();
        terminalService.resize(id, inst.terminal.cols, inst.terminal.rows).catch(() => {});
      }
    }
  }, [settings, sessions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useSftpStore.getState().viewMode === "terminal" && (e.metaKey || e.ctrlKey) && e.key === "f") { e.preventDefault(); setSearchOpen(true); requestAnimationFrame(() => document.querySelector<HTMLInputElement>("[data-terminal-search]")?.focus()); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  const find = (previous: boolean) => {
    const addon = activeSessionId ? instancesRef.current.get(activeSessionId)?.searchAddon : null;
    if (addon && search) setSearchFound(previous ? addon.findPrevious(search) : addon.findNext(search));
  };

  const handleAreaClick = () => {
    if (activeSessionId) {
      instancesRef.current.get(activeSessionId)?.terminal.focus();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab 栏 */}
      {sessions.length > 0 && (
        <div className="flex items-center h-9 border-b border-border-subtle bg-surface shrink-0">
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
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    disconnected ? "bg-danger" : session.status === "connecting" ? "bg-warning animate-pulse" : "bg-success"
                  }`}
                />
                <span className="max-w-[100px] truncate">{session.serverName}</span>
                {disconnected && (
                  <button
                    className="ml-0.5 w-4 h-4 rounded flex items-center justify-center text-tertiary hover:text-accent hover:bg-accent-soft transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      void runAction(() => reconnect(session.sessionId));
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
                    void runAction(() => close(session.sessionId));
                  }}
                  disabled={session.status === "connecting"}
                  title={session.status === "connecting" ? "正在建立连接" : "关闭"}
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            );
          })}
          </div>
          <button className="px-3 text-label text-tertiary hover:text-accent" onClick={() => setSearchOpen((v) => !v)} title="搜索终端 (⌘F)">搜索</button>
        </div>
      )}

      {searchOpen && <form className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border-subtle text-helper" onSubmit={(e) => { e.preventDefault(); find(false); }}>
        <input data-terminal-search autoFocus aria-label="搜索终端内容" className="flex-1 min-w-0 bg-base text-primary border border-border-subtle rounded px-2 py-1" placeholder="搜索终端内容" value={search} onChange={(e) => { setSearch(e.target.value); setSearchFound(true); }} onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }} />
        {!searchFound && <span className="text-warning text-label">未找到</span>}
        <button type="button" onClick={() => find(true)}>上一处</button><button type="submit">下一处</button><button type="button" onClick={() => setSearchOpen(false)}>关闭</button>
      </form>}
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
                    void runAction(() => reconnect(active.sessionId));
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
          <div className="flex items-center gap-2 px-3 h-6 border-t border-border-subtle bg-surface shrink-0 text-label text-tertiary select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
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
