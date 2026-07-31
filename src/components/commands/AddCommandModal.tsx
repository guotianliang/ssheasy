import { useState } from "react";
import { useCommandStore } from "@/stores/useCommandStore";

export function AddCommandModal({ onClose }: { onClose: () => void }) {
  const addCommand = useCommandStore((s) => s.addCommand);
  const [cmd, setCmd] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("自定义命令");

  const handleSave = async () => {
    if (!cmd.trim()) return;
    await addCommand({ cmd: cmd.trim(), description: description || undefined, category });
    onClose();
  };

  const inputClass = "w-full px-3 py-2 rounded-lg text-xs text-gray-200 outline-none focus:border-indigo-500 transition-colors bg-[#0d0d14] border border-[#333]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-80 rounded-xl p-5 shadow-2xl bg-[#1e1e2e] border border-[#333]">
        <h3 className="text-sm font-semibold text-gray-200 mb-4">添加自定义命令</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block">命令 *</label>
            <input
              className={`${inputClass} font-mono`}
              placeholder="docker logs -f {{容器名}}"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              autoFocus
            />
            <div className="text-[10px] text-gray-600 mt-1">
              用 {"{{变量名}}"} 标记需要填写的参数
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block">说明</label>
            <input className={inputClass} placeholder="查看容器实时日志" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block">分组</label>
            <input className={inputClass} placeholder="自定义命令" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button className="flex-1 py-2 rounded-lg text-xs text-gray-400 bg-[#2a2a3a] hover:text-gray-200" onClick={onClose}>
            取消
          </button>
          <button
            className="flex-1 py-2 rounded-lg text-xs font-medium text-white transition-colors"
            style={{ background: cmd.trim() ? "#6366f1" : "#333" }}
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
