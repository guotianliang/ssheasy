import { useState } from "react";
import { CommandItem } from "./CommandItem";
import type { CommandTemplate } from "@/types/command";

interface CategorySectionProps {
  name: string;
  commands: CommandTemplate[];
  onCommand: (cmd: CommandTemplate, mode: "insert" | "execute") => void;
  onDelete: (id: string) => void;
}

export function CategorySection({ name, commands, onCommand, onDelete }: CategorySectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left rounded-md hover:bg-elevated transition-colors duration-150"
        onClick={() => setOpen(!open)}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className="transition-transform duration-200 text-tertiary"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <path d="M3 1L8 5L3 9V1Z" fill="currentColor" />
        </svg>
        <span className="text-helper font-medium text-secondary">{name}</span>
        <span className="ml-auto text-label text-disabled">{commands.length}</span>
      </button>
      {open && (
        <div className="ml-1 mt-0.5 space-y-0.5">
          {commands.map((cmd) => (
            <CommandItem key={cmd.id} item={cmd} onCommand={onCommand} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
