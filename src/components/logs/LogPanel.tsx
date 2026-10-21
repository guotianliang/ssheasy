import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useLogStore } from "@/stores/useLogStore";
import { useServerStore } from "@/stores/useServerStore";
import { runAction } from "@/lib/errors";
const RISK_STYLE: Record<string, { label: string; color: string }> = {
  high: { label: "高危", color: "var(--danger)" }, medium: { label: "中危", color: "var(--warning)" }, low: { label: "低危", color: "var(--success)" },
};
export function LogPanel() {
  const { logs, loading, error, fetch } = useLogStore();
  const servers = useServerStore((s) => s.servers);
  const [serverId, setServerId] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => { void fetch(serverId || undefined); }, [serverId, fetch]);
  const filtered = logs.filter((log) => log.command.toLowerCase().includes(search.toLowerCase()));
  const exportLogs = async () => {
    const destPath = await save({ title: "导出操作日志", defaultPath: "ssheasy-logs.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (destPath) await invoke("logs_export", { serverId: serverId || null, destPath });
  };
  return <div className="flex flex-col h-full bg-base">
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border-subtle text-helper shrink-0">
      <span className="font-medium text-secondary">操作日志</span>
      <select aria-label="按服务器筛选日志" className="bg-surface rounded border border-border-subtle px-2 py-1 min-w-0 max-w-36" value={serverId} onChange={(e) => setServerId(e.target.value)}><option value="">全部服务器</option>{servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <button className="ml-auto text-accent disabled:opacity-40" disabled={loading} onClick={() => fetch(serverId || undefined)}>刷新</button>
      <button className="text-accent" onClick={() => { void runAction(exportLogs); }}>导出</button>
    </div>
    <div className="px-3 py-2 border-b border-border-subtle"><input aria-label="搜索日志" className="w-full px-2 py-1.5 bg-surface rounded border border-border-subtle text-helper" placeholder="搜索最近 300 条记录…" value={search} onChange={(e) => setSearch(e.target.value)} /><p className="mt-1 text-label text-tertiary">记录快捷命令发送和文件操作；终端键入内容不录制。时间为 UTC。</p></div>
    {error && <div role="alert" className="px-3 py-2 text-danger text-helper">{error}</div>}
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {loading && <p className="text-center text-helper text-tertiary py-8">加载中…</p>}
      {!loading && !error && filtered.length === 0 && <p className="text-center text-helper text-tertiary py-8">{search ? "没有匹配的记录" : "暂无操作记录"}</p>}
      {filtered.map((log) => {
        const risk = RISK_STYLE[log.riskLevel] ?? RISK_STYLE.low;
        return <div key={log.id} className="rounded-md px-3 py-2 bg-surface border border-border-subtle">
          <div className="flex items-center gap-2 mb-1 text-label text-tertiary"><span style={{ color: risk.color }}>{risk.label}</span><span>{servers.find((s) => s.id === log.serverId)?.name || log.serverId}</span><time className="ml-auto">{log.executedAt}</time></div>
          <div className="text-helper font-mono text-secondary break-all">{log.command}</div>
        </div>;
      })}
    </div>
  </div>;
}
