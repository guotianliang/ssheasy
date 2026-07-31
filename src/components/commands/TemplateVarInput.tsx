import { useState } from "react";
import { parseTemplateVars, renderTemplate } from "@/types/command";
import type { CommandTemplate } from "@/types/command";

interface TemplateVarInputProps {
  cmd: CommandTemplate;
  onConfirm: (renderedCmd: string) => void;
  onCancel: () => void;
}

/** 命令模板变量填写弹窗 */
export function TemplateVarInput({ cmd, onConfirm, onCancel }: TemplateVarInputProps) {
  const varNames = parseTemplateVars(cmd.cmd);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(varNames.map((v) => [v, ""]))
  );

  const allFilled = varNames.every((v) => values[v].trim() !== "");
  const rendered = renderTemplate(cmd.cmd, values);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-80 rounded-xl p-5 shadow-2xl bg-[#1e1e2e] border border-[#333]">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">填写参数</h3>
        <div className="text-[11px] text-gray-500 font-mono mb-4 truncate">{cmd.cmd}</div>

        <div className="space-y-3">
          {varNames.map((name) => (
            <div key={name}>
              <label className="text-[11px] text-gray-500 mb-1 block">{name}</label>
              <input
                className="w-full px-3 py-2 rounded-lg text-xs font-mono text-gray-200 outline-none focus:border-indigo-500 transition-colors bg-[#0d0d14] border border-[#333]"
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
        <div className="mt-3 px-3 py-2 rounded-lg bg-[#0d0d14] border border-[#252530]">
          <div className="text-[10px] text-gray-600 mb-0.5">预览</div>
          <div className="text-xs font-mono text-green-400 truncate">{rendered}</div>
        </div>

        <div className="flex gap-2 mt-4">
          <button className="flex-1 py-2 rounded-lg text-xs text-gray-400 bg-[#2a2a3a]" onClick={onCancel}>
            取消
          </button>
          <button
            className="flex-1 py-2 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-40"
            style={{ background: allFilled ? "#6366f1" : "#333" }}
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
