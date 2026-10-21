import { errorMessage } from "@/lib/errors";
import type { CommandTemplate } from "@/types/command";
import { useState, useEffect } from "react";
import { useCommandStore } from "@/stores/useCommandStore";

export function AddCommandModal({ onClose, command }: { onClose: () => void; command?: CommandTemplate }) {
  const addCommand = useCommandStore((s) => s.addCommand);
  const updateCommand = useCommandStore((s) => s.updateCommand);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cmd, setCmd] = useState(command?.cmd ?? "");
  const [description, setDescription] = useState(command?.description ?? "");
  const [category, setCategory] = useState(command?.category ?? "自定义命令");

  const handleSave = async () => {
    if (!cmd.trim() || busy) return;
    setBusy(true); setError("");
    const input = { cmd: cmd.trim(), description: description || undefined, category: category.trim() || "自定义命令" };
    try { if (command) await updateCommand(command.id, input); else await addCommand(input); onClose(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();

    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cmd, description, category]);

  const inputClass =
    "w-full px-3 py-2 rounded-lg text-helper text-primary outline-none placeholder-tertiary bg-base border border-border-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all duration-150";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-80 rounded-xl p-5 shadow-2xl bg-surface border border-border-subtle animate-slide-in">
        <h3 className="text-title font-medium text-primary mb-4">{command ? "编辑命令" : "添加自定义命令"}</h3>
        {error && <p role="alert" className="text-danger text-helper mb-2">{error}</p>}
        <div className="space-y-3">
          <div>
            <label className="text-label text-tertiary mb-1 block">命令 *</label>
            <input
              className={`${inputClass} font-mono`}
              placeholder="docker logs -f {{容器名}}"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              autoFocus
            />
            <div className="text-label text-disabled mt-1">
              用 {"{{变量名}}"} 标记需要填写的参数
            </div>
          </div>
          <div>
            <label className="text-label text-tertiary mb-1 block">说明</label>
            <input
              className={inputClass}
              placeholder="查看容器实时日志"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="text-label text-tertiary mb-1 block">分组</label>
            <input
              className={inputClass}
              placeholder="自定义命令"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            className="flex-1 py-2 rounded-lg text-helper text-secondary bg-elevated border border-border-subtle hover:text-primary transition-colors"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="flex-1 py-2 rounded-lg text-helper font-medium text-white bg-accent hover:bg-accent-hover transition-colors"
            style={{ opacity: cmd.trim() ? 1 : 0.4 }}
            disabled={!cmd.trim() || busy}
            onClick={handleSave}
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
