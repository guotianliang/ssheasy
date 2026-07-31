import { useState, useMemo } from "react";
import { useCommandStore } from "@/stores/useCommandStore";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { terminalService } from "@/services/terminalService";
import { CategorySection } from "./CategorySection";
import { AddCommandModal } from "./AddCommandModal";
import { TemplateVarInput } from "./TemplateVarInput";
import { parseTemplateVars } from "@/types/command";
import type { CommandTemplate } from "@/types/command";

export function CommandSidebar() {
  const { commands, deleteCommand } = useCommandStore();
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [varModal, setVarModal] = useState<{ cmd: CommandTemplate; mode: "insert" | "execute" } | null>(null);
  const [noSessionHint, setNoSessionHint] = useState(false);

  // 按分类分组 + 搜索过滤
  const grouped = useMemo(() => {
    const filtered = search
      ? commands.filter(
          (c) => c.cmd.includes(search) || (c.description || "").includes(search) || c.category.includes(search)
        )
      : commands;

    return filtered.reduce<Record<string, CommandTemplate[]>>((acc, cmd) => {
      if (!acc[cmd.category]) acc[cmd.category] = [];
      acc[cmd.category].push(cmd);
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
    } else {
      terminalService.sendInput(activeSessionId, renderedCmd);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-[#1a1a24] flex-shrink-0">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">快捷命令</span>
        <button
          className="w-5 h-5 rounded flex items-center justify-center text-gray-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all duration-150"
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
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" width="11" height="11" viewBox="0 0 12 12" fill="none">
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8 8L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            className="w-full pl-7 pr-2.5 py-1.5 rounded-md text-[11px] text-gray-300 outline-none placeholder-gray-600 bg-[#0a0a0f] border border-[#1e1e2a] focus:border-indigo-500/50 focus:bg-[#0d0d14] transition-all duration-150"
            placeholder="搜索命令..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

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
          <div className="text-center text-[11px] text-gray-600 py-8">
            {search ? "没有匹配的命令" : "暂无命令"}
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="px-3 py-2.5 border-t border-[#1a1a24] flex-shrink-0 space-y-1">
        {noSessionHint && (
          <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 animate-fade-in">
            请先在左侧选择服务器并连接
          </div>
        )}
        <div className="flex items-center gap-3 text-[9px] text-gray-600">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-[#1a1a24] text-center leading-3 text-[8px] text-gray-500">↵</span>
            填入终端
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-emerald-500/10 text-center leading-3 text-[8px] text-emerald-500">▶</span>
            直接执行
          </span>
        </div>
        {!activeSessionId && (
          <div className="text-[9px] text-yellow-600/80">未连接服务器，命令无法执行</div>
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
