import { MutableRefObject } from "react";
import { ServerList } from "@/components/connection/ServerList";
import { WorkspacePanel } from "@/components/layout/WorkspacePanel";
import { CommandSidebar } from "@/components/commands/CommandSidebar";
import { useTerminalStore } from "@/stores/useTerminalStore";
import type { TerminalOutputEvent } from "@/types/terminal";

interface AppShellProps {
  outputHandlerRef: MutableRefObject<(event: TerminalOutputEvent) => void>;
}

export function AppShell({ outputHandlerRef }: AppShellProps) {
  const sessions = useTerminalStore((s) => s.sessions);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-base">
      {/* 顶部标题栏 */}
      <header className="h-9 flex items-center px-4 border-b border-border-subtle bg-surface select-none flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gradient-to-br from-accent to-accent-active flex items-center justify-center">
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path d="M2 3L5 6L2 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 9H10" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-helper font-medium text-secondary">SSHEasy</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {sessions.length > 0 && (
            <span className="text-label text-tertiary">
              {sessions.length} 个活跃连接
            </span>
          )}
          <span className="text-label text-disabled">v0.1.0</span>
        </div>
      </header>

      {/* 主体三栏 */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧：服务器列表 */}
        <aside className="w-52 flex-shrink-0 border-r border-border-subtle bg-surface flex flex-col">
          <ServerList />
        </aside>

        {/* 中间：终端 / 文件 双视图 */}
        <main className="flex-1 flex flex-col min-w-0 bg-base">
          <WorkspacePanel outputHandlerRef={outputHandlerRef} />
        </main>

        {/* 右侧：命令面板 */}
        <aside className="w-60 flex-shrink-0 border-l border-border-subtle bg-surface">
          <CommandSidebar />
        </aside>
      </div>
    </div>
  );
}
