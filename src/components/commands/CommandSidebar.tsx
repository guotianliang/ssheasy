import { useState, useMemo, useEffect } from "react";
import { useCommandStore } from "@/stores/useCommandStore";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useLogStore } from "@/stores/useLogStore";
import { terminalService } from "@/services/terminalService";
import { CategorySection } from "./CategorySection";
import { AddCommandModal } from "./AddCommandModal";
import { TemplateVarInput } from "./TemplateVarInput";
import { PathBookmarkPanel } from "./PathBookmarkPanel";
import { parseTemplateVars } from "@/types/command";
import type { CommandTemplate } from "@/types/command";

export function CommandSidebar() {
  const { commands, deleteCommand, recentCommands, fetchRecent } = useCommandStore();
  const { sessions, activeSessionId } = useTerminalStore();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [varModal, setVarModal] = useState<{ cmd: CommandTemplate; mode: "insert" | "execute" } | null>(null);
  const [noSessionHint, setNoSessionHint] = useState(false);
  const [showRecent, setShowRecent] = useState(true);

  // 当前活跃服务器：切换时拉取最近使用
  const activeServerId = sessions.find((s) => s.sessionId === activeSessionId)?.serverId ?? null;
  useEffect(() => {
    if (activeServerId) {
      fetchRecent(activeServerId);
    }
  }, [activeServerId, fetchRecent]);

  // 按分类分组 + 搜索过滤；自定义命令的分组排在内置命令前面
  const grouped = useMemo(() => {
    const filtered = search
      ? commands.filter(
          (c) => c.cmd.includes(search) || (c.description || "").includes(search) || c.category.includes(search)
        )
      : commands;

    const groups = filtered.reduce<Record<string, CommandTemplate[]>>((acc, cmd) => {
      if (!acc[cmd.category]) acc[cmd.category] = [];
      acc[cmd.category].push(cmd);
      return acc;
    }, {});

    // 自定义命令分组排前面
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const aHasCustom = groups[a].some((c) => !c.isBuiltin);
      const bHasCustom = groups[b].some((c) => !c.isBuiltin);
      if (aHasCustom && !bHasCustom) return -1;
      if (!aHasCustom && bHasCustom) return 1;
      return 0;
    });
    return sortedKeys.reduce<Record<string, CommandTemplate[]>>((acc, key) => {
      acc[key] = groups[key];
      return acc;
    }, {});
  }, [commands, search]);

  // 处理命令点击
  const handleCommand = (cmd: CommandTemplate, mode: "insert" | "execute") => {
    const vars = parseTemplateVars(cmd.cmd);
    if (vars.length > 0) {
      setVarModal({ cmd, mode });
    } else {
      executeOrInsert(cmd.cmd, mode);
    }
  };

  const executeOrInsert = (renderedCmd: string, mode: "insert" | "execute") => {
    if (!activeSessionId) {
      setNoSessionHint(true);
      setTimeout(() => setNoSessionHint(false), 2500);
      return;
    }
    if (mode === "execute") {
      terminalService.sendInput(activeSessionId, renderedCmd + "\n");
      const serverId = useTerminalStore
        .getState()
        .sessions.find((s) => s.sessionId === activeSessionId)?.serverId;
      if (serverId) {
        useLogStore.getState().record(serverId, renderedCmd);
        useCommandStore.getState().bumpRecent(serverId, renderedCmd);
      }
    } else {
      terminalService.sendInput(activeSessionId, renderedCmd);
    }
  };

  // 最近使用：点击执行（不带模板变量直接执行）
  const handleRecentClick = (command: string) => {
    if (!activeSessionId) {
      setNoSessionHint(true);
      setTimeout(() => setNoSessionHint(false), 2500);
      return;
    }
    terminalService.sendInput(activeSessionId, command + "\n");
    if (activeServerId) {
      useLogStore.getState().record(activeServerId, command);
      useCommandStore.getState().bumpRecent(activeServerId, command);
    }
  };

  // Cmd+K 聚焦搜索框
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>("[data-cmd-search]");
        input?.focus();
        input?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const inputClass =
    "w-full pl-7 pr-2.5 py-1.5 rounded-md text-helper text-primary outline-none placeholder-tertiary bg-base border border-border-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all duration-150";

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-border-subtle flex-shrink-0">
        <span className="text-helper font-medium text-secondary uppercase tracking-wide">快捷命令</span>
        <button
          className="w-5 h-5 rounded flex items-center justify-center text-tertiary hover:text-accent hover:bg-accent-soft transition-all duration-150"
          onClick={() => setShowAdd(true)}
          title="添加自定义命令"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* 搜索框 */}
      <div className="px-2.5 py-2 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary" width="11" height="11" viewBox="0 0 12 12" fill="none">
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8 8L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            className={inputClass}
            placeholder="搜索命令... (⌘K)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-cmd-search
          />
        </div>
      </div>

      {/* 最近使用（按当前服务器） */}
      {activeSessionId && recentCommands.length > 0 && !search && (
        <div className="px-2 pt-2 pb-1 flex-shrink-0">
          <div
            className="flex items-center justify-between px-1 mb-1 cursor-pointer select-none"
            onClick={() => setShowRecent(!showRecent)}
          >
            <span className="text-label font-medium text-tertiary uppercase tracking-wide">
              最近使用
            </span>
            <svg
              width="8"
              height="8"
              viewBox="0 0 10 10"
              className={`text-disabled transition-transform duration-150 ${showRecent ? "rotate-180" : ""}`}
            >
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          {showRecent && (
            <div className="space-y-0.5">
              {recentCommands.slice(0, 6).map((r) => (
                <button
                  key={`${r.serverId}-${r.command}-${r.executedAt}`}
                  className="flex items-center gap-1.5 w-full px-1.5 py-1 rounded-md text-left group hover:bg-elevated transition-colors duration-100"
                  onClick={() => handleRecentClick(r.command)}
                  title={`执行：${r.command}`}
                >
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" className="text-disabled flex-shrink-0">
                    <path d="M2.5 2L8.5 6L2.5 10V2Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                  </svg>
                  <span className="truncate text-helper text-secondary group-hover:text-primary font-mono transition-colors">
                    {r.command}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 命令列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {Object.entries(grouped).map(([category, cmds]) => (
          <CategorySection
            key={category}
            name={category}
            commands={cmds}
            onCommand={handleCommand}
            onDelete={deleteCommand}
          />
        ))}
        {Object.keys(grouped).length === 0 && (
          <div className="text-center text-helper text-tertiary py-8">
            {search ? "没有匹配的命令" : "暂无命令"}
          </div>
        )}
      </div>

      {/* 路径书签 */}
      <PathBookmarkPanel />

      {/* 底部提示 */}
      <div className="px-3 py-2.5 border-t border-border-subtle flex-shrink-0 space-y-1">
        {noSessionHint && (
          <div className="text-label text-warning bg-warning-soft border border-warning/20 rounded px-2 py-1 animate-fade-in">
            请先在左侧选择服务器并连接
          </div>
        )}
        <div className="flex items-center gap-3 text-label text-disabled">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-elevated text-center leading-3 text-[8px] text-tertiary">↵</span>
            填入终端
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-success-soft text-center leading-3 text-[8px] text-success">▶</span>
            直接执行
          </span>
        </div>
        {!activeSessionId && (
          <div className="text-label text-warning/80">未连接服务器，命令无法执行</div>
        )}
      </div>

      {/* 弹窗 */}
      {showAdd && <AddCommandModal onClose={() => setShowAdd(false)} />}
      {varModal && (
        <TemplateVarInput
          cmd={varModal.cmd}
          onConfirm={(rendered) => {
            executeOrInsert(rendered, varModal.mode);
            setVarModal(null);
          }}
          onCancel={() => setVarModal(null)}
        />
      )}
    </div>
  );
}
