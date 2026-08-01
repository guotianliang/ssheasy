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
      style={{ background: hovered ? "var(--accent-soft)" : "transparent" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onCommand(item, "insert")}
      title={item.cmd}
    >
      <div className="flex-1 min-w-0">
        <div className="text-helper font-mono text-primary truncate">{item.cmd}</div>
        {item.description && (
          <div className="text-label text-tertiary truncate">{item.description}</div>
        )}
      </div>

      {/* 直接执行按钮 */}
      <button
        className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{ background: "var(--success-soft)" }}
        onClick={(e) => {
          e.stopPropagation();
          onCommand(item, "execute");
        }}
        title="直接执行"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 1L9 5L2 9V1Z" fill="var(--success)" />
        </svg>
      </button>

      {/* 删除按钮（仅自定义命令） */}
      {!item.isBuiltin && (
        <button
          className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-disabled hover:text-danger"
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
