import { MutableRefObject } from "react";
import { ServerList } from "@/components/connection/ServerList";
import { TerminalPanel } from "@/components/terminal/TerminalPanel";
import { CommandSidebar } from "@/components/commands/CommandSidebar";
import { useTerminalStore } from "@/stores/useTerminalStore";
import type { TerminalOutputEvent } from "@/types/terminal";

interface AppShellProps {
  outputHandlerRef: MutableRefObject<(event: TerminalOutputEvent) => void>;
}

export function AppShell({ outputHandlerRef }: AppShellProps) {
  const sessions = useTerminalStore((s) => s.sessions);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0a0f]">
      {/* 顶部标题栏 */}
      <header className="h-9 flex items-center px-4 border-b border-[#1a1a24] bg-[#0e0e15] select-none flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path d="M2 3L5 6L2 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 9H10" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-[11px] font-medium text-gray-400">SSHEasy</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {sessions.length > 0 && (
            <span className="text-[10px] text-gray-600">
              {sessions.length} 个活跃连接
            </span>
          )}
          <span className="text-[10px] text-gray-700">v0.1.0</span>
        </div>
      </header>

      {/* 主体三栏 */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧：服务器列表 */}
        <aside className="w-52 flex-shrink-0 border-r border-[#1a1a24] bg-[#0e0e15] flex flex-col">
          <ServerList />
        </aside>

        {/* 中间：终端区域 */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#0a0a0f]">
          <TerminalPanel outputHandlerRef={outputHandlerRef} />
        </main>

        {/* 右侧：命令面板 */}
        <aside className="w-60 flex-shrink-0 border-l border-[#1a1a24] bg-[#0e0e15]">
          <CommandSidebar />
        </aside>
      </div>
    </div>
  );
}
