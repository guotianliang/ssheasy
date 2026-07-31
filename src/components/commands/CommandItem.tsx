import { useState } from "react";
import type { CommandTemplate } from "@/types/command";

interface CommandItemProps {
  item: CommandTemplate;
  onCommand: (cmd: CommandTemplate, mode: "insert" | "execute") => void;
  onDelete: (id: string) => void;
}

export function CommandItem({ item, onCommand, onDelete }: CommandItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-all duration-150"
      style={{ background: hovered ? "rgba(99,102,241,0.12)" : "transparent" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onCommand(item, "insert")}
      title="单击 → 填入终端（可编辑后回车）"
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono text-gray-200 truncate">{item.cmd}</div>
        {item.description && (
          <div className="text-[10px] text-gray-500 truncate">{item.description}</div>
        )}
      </div>

      {/* 直接执行按钮 */}
      <button
        className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "rgba(34,197,94,0.2)" }}
        onClick={(e) => {
          e.stopPropagation();
          onCommand(item, "execute");
        }}
        title="直接执行"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 1L9 5L2 9V1Z" fill="#22c55e" />
        </svg>
      </button>

      {/* 删除按钮（仅自定义命令） */}
      {!item.isBuiltin && (
        <button
          className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          title="删除"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
