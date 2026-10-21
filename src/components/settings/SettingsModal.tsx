import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { defaultSettings, useSettingsStore } from "@/stores/useSettingsStore";
import { useLogStore } from "@/stores/useLogStore";
import { useCommandStore } from "@/stores/useCommandStore";
import { errorMessage } from "@/lib/errors";
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, save } = useSettingsStore();
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = "w-36 px-2 py-1.5 rounded bg-base border border-border-subtle text-primary";
  const handleSave = async () => {
    setBusy(true); setError("");
    try { await save(draft); onClose(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center" onKeyDown={(e) => { if (e.key === "Escape" && !busy) onClose(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="settings-title" className="w-[460px] p-6 rounded-xl bg-surface border border-border-subtle shadow-2xl space-y-5 text-helper" onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
      <div className="flex items-center justify-between"><h2 id="settings-title" className="text-title text-primary">设置</h2><span className="text-tertiary">保存后立即生效</span></div>
      <label className="flex items-center justify-between">外观<select className={field} value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value as typeof draft.theme })}><option value="dark">深色</option><option value="light">浅色</option></select></label>
      <label className="flex items-center justify-between">终端字号<input aria-label="终端字号" type="number" min={10} max={24} className={field} value={draft.fontSize} onChange={(e) => setDraft({ ...draft, fontSize: Number(e.target.value) })} /></label>
      <label className="flex items-center justify-between">终端滚动行数<input type="number" min={1000} max={50000} step={1000} className={field} value={draft.scrollback} onChange={(e) => setDraft({ ...draft, scrollback: Number(e.target.value) })} /></label>
      <label className="flex items-center justify-between">光标形状<select className={field} value={draft.cursorStyle} onChange={(e) => setDraft({ ...draft, cursorStyle: e.target.value as typeof draft.cursorStyle })}><option value="bar">竖线</option><option value="block">方块</option><option value="underline">下划线</option></select></label>
      <label className="flex items-center justify-between">日志和最近命令保留天数<input type="number" min={1} max={365} className={field} value={draft.logRetentionDays} onChange={(e) => setDraft({ ...draft, logRetentionDays: Number(e.target.value) })} /></label>
      <p className="text-label text-tertiary">保存设置及每次启动时清理过期记录。快捷键：⌘F 搜索终端，⌘K 搜索命令，⌘, 打开设置。</p>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <div className="flex gap-3 border-t border-border-subtle pt-4">
        <button type="button" className="text-danger disabled:opacity-40" disabled={busy} onClick={async () => {
          if (!await confirm("清空全部操作日志和最近命令？此操作无法恢复。", { title: "清空记录", kind: "warning" })) return;
          setBusy(true);
          try { await invoke("logs_clear"); useLogStore.setState({ logs: [] }); useCommandStore.setState({ recentCommands: [] }); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
        }}>清空记录</button>
        <button type="button" className="text-secondary" disabled={busy} onClick={() => setDraft(defaultSettings)}>恢复默认</button>
        <button type="button" className="ml-auto text-secondary" disabled={busy} onClick={onClose}>取消</button>
        <button type="submit" className="px-4 py-1.5 rounded bg-accent text-white disabled:opacity-40" disabled={busy}>{busy ? "保存中…" : "保存"}</button>
      </div>
    </form>
  </div>;
}
