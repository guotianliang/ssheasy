import { useState, useEffect } from "react";
import { parseTemplateVars, renderTemplate } from "@/types/command";
import type { CommandTemplate } from "@/types/command";

interface TemplateVarInputProps {
  cmd: CommandTemplate;
  onConfirm: (renderedCmd: string) => void;
  onCancel: () => void;
}

export function TemplateVarInput({ cmd, onConfirm, onCancel }: TemplateVarInputProps) {
  const varNames = parseTemplateVars(cmd.cmd);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(varNames.map((v) => [v, ""]))
  );

  const allFilled = varNames.every((v) => values[v].trim() !== "");
  const rendered = renderTemplate(cmd.cmd, values);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const inputClass =
    "w-full px-3 py-2 rounded-lg text-helper font-mono text-primary outline-none placeholder-tertiary bg-base border border-border-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all duration-150";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-80 rounded-xl p-5 shadow-2xl bg-surface border border-border-subtle animate-slide-in">
        <h3 className="text-title font-medium text-primary mb-1">填写参数</h3>
        <div className="text-label text-tertiary font-mono mb-4 truncate">{cmd.cmd}</div>

        <div className="space-y-3">
          {varNames.map((name) => (
            <div key={name}>
              <label className="text-label text-tertiary mb-1 block">{name}</label>
              <input
                className={inputClass}
                value={values[name]}
                onChange={(e) => setValues({ ...values, [name]: e.target.value })}
                autoFocus={name === varNames[0]}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && allFilled) onConfirm(rendered);
                }}
              />
            </div>
          ))}
        </div>

        {/* 预览 */}
        <div className="mt-3 px-3 py-2 rounded-lg bg-base border border-border-subtle">
          <div className="text-label text-disabled mb-0.5">预览</div>
          <div className="text-helper font-mono text-success truncate">{rendered}</div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            className="flex-1 py-2 rounded-lg text-helper text-secondary bg-elevated border border-border-subtle hover:text-primary transition-colors"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="flex-1 py-2 rounded-lg text-helper font-medium text-white transition-colors disabled:opacity-40"
            style={{ background: allFilled ? "var(--accent)" : "var(--border-subtle)" }}
            disabled={!allFilled}
            onClick={() => onConfirm(rendered)}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
