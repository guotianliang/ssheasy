import { useState } from "react";
import { useServerStore } from "@/stores/useServerStore";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { ServerFormModal } from "./AddServerWizard";
import type { ConnectionStatus, Server } from "@/types/server";

const STATUS_DOT: Record<ConnectionStatus, string> = {
  disconnected: "bg-gray-600",
  connecting: "bg-yellow-400 animate-pulse-dot",
  connected: "bg-emerald-400",
  error: "bg-red-400",
};

export function ServerList() {
  const { servers, connectionStatus, deleteServer } = useServerStore();
  const connect = useTerminalStore((s) => s.connect);
  const [showWizard, setShowWizard] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [deletingServer, setDeletingServer] = useState<Server | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (serverId: string, serverName: string) => {
    setConnecting(serverId);
    setError(null);
    useServerStore.getState().setConnectionStatus(serverId, "connecting");
    try {
      await connect(serverId, serverName);
      useServerStore.getState().setConnectionStatus(serverId, "connected");
    } catch (e: any) {
      useServerStore.getState().setConnectionStatus(serverId, "error");
      const msg = e?.error?.humanMsg || e?.message || "连接失败";
      setError(msg);
      // 5秒后恢复为 disconnected 状态
      setTimeout(() => {
        useServerStore.getState().setConnectionStatus(serverId, "disconnected");
      }, 5000);
    } finally {
      setConnecting(null);
    }
  };

  // 按分组归类
  const groups = servers.reduce<Record<string, typeof servers>>((acc, s) => {
    const group = s.groupName || "默认分组";
    if (!acc[group]) acc[group] = [];
    acc[group].push(s);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-[#1a1a24] flex-shrink-0">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">服务器</span>
        <button
          className="w-5 h-5 rounded flex items-center justify-center text-gray-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all duration-150"
          onClick={() => setShowWizard(true)}
          title="添加服务器"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-2 mt-2 px-2.5 py-2 rounded-md bg-red-500/8 border border-red-500/20 animate-fade-in">
          <div className="text-[10px] text-red-400">{error}</div>
        </div>
      )}

      {/* 服务器列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {Object.entries(groups).map(([groupName, groupServers]) => (
          <div key={groupName}>
            <div className="text-[9px] text-gray-600 uppercase tracking-widest px-2 mb-1.5 font-medium">
              {groupName}
            </div>
            <div className="space-y-px">
              {groupServers.map((server) => {
                const status = connectionStatus[server.id] || "disconnected";
                return (
                  <div
                    key={server.id}
                    className="group flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer hover:bg-white/[0.03] active:bg-white/[0.05] transition-all duration-100"
                    onClick={() => handleConnect(server.id, server.name)}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-gray-300 truncate leading-tight">{server.name}</div>
                      <div className="text-[9px] text-gray-600 truncate font-mono mt-0.5">
                        {server.username}@{server.host}:{server.port}
                      </div>
                    </div>
                    {connecting === server.id && (
                      <svg className="w-3 h-3 text-yellow-400 animate-spin" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 12" />
                      </svg>
                    )}
                    <button
                      className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-indigo-400 transition-all duration-150 p-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingServer(server);
                      }}
                      title="编辑"
                    >
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                        <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-400 transition-all duration-150 p-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingServer(server);
                      }}
                      title="删除"
                    >
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {servers.length === 0 && (
          <div className="text-center py-12 animate-fade-in">
            <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-[#1a1a24] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="7" rx="2" />
                <rect x="2" y="14" width="20" height="7" rx="2" />
                <circle cx="6" cy="6.5" r="1" fill="#4b5563" />
                <circle cx="6" cy="17.5" r="1" fill="#4b5563" />
              </svg>
            </div>
            <div className="text-[11px] text-gray-500 mb-1">还没有服务器</div>
            <button
              className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
              onClick={() => setShowWizard(true)}
            >
              + 添加第一台
            </button>
          </div>
        )}
      </div>

      {/* 底部状态 */}
      <div className="px-3 py-2 border-t border-[#1a1a24] flex-shrink-0">
        <div className="text-[9px] text-gray-700">
          {servers.length} 台服务器 · {Object.values(connectionStatus).filter(s => s === "connected").length} 台在线
        </div>
      </div>

      {/* 添加 / 编辑服务器弹窗 */}
      {showWizard && <ServerFormModal onClose={() => setShowWizard(false)} />}
      {editingServer && (
        <ServerFormModal server={editingServer} onClose={() => setEditingServer(null)} />
      )}

      {/* 删除确认弹窗 */}
      {deletingServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-80 rounded-xl p-5 shadow-2xl bg-[#1e1e2e] border border-[#333]">
            <h3 className="text-sm font-semibold text-gray-200 mb-2">删除服务器</h3>
            <p className="text-xs text-gray-400 mb-1">
              确定要删除 <span className="text-gray-200">{deletingServer.name}</span> 吗？
            </p>
            <p className="text-[10px] text-gray-600 font-mono mb-4">
              {deletingServer.username}@{deletingServer.host}:{deletingServer.port}
            </p>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-lg text-xs text-gray-400 bg-[#2a2a3a] hover:text-gray-200 transition-colors"
                onClick={() => setDeletingServer(null)}
              >
                取消
              </button>
              <button
                className="flex-1 py-2 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-500 transition-colors"
                onClick={async () => {
                  await deleteServer(deletingServer.id);
                  setDeletingServer(null);
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
