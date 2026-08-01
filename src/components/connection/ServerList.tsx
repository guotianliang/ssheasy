import { useState, useEffect } from "react";
import { useServerStore } from "@/stores/useServerStore";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { ServerFormModal } from "./AddServerWizard";
import type { ConnectionStatus, Server } from "@/types/server";

const STATUS_DOT: Record<ConnectionStatus, string> = {
  disconnected: "bg-disabled",
  connecting: "bg-warning animate-pulse-dot",
  connected: "bg-success",
  error: "bg-danger",
};

export function ServerList() {
  const { servers, connectionStatus, deleteServer } = useServerStore();
  const connect = useTerminalStore((s) => s.connect);
  const [showWizard, setShowWizard] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [deletingServer, setDeletingServer] = useState<Server | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
      setTimeout(() => {
        useServerStore.getState().setConnectionStatus(serverId, "disconnected");
      }, 5000);
    } finally {
      setConnecting(null);
    }
  };

  // 搜索过滤
  const filtered = search
    ? servers.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.host.toLowerCase().includes(search.toLowerCase()) ||
          s.username.toLowerCase().includes(search.toLowerCase())
      )
    : servers;

  // 按分组归类
  const groups = filtered.reduce<Record<string, typeof servers>>((acc, s) => {
    const group = s.groupName || "默认分组";
    if (!acc[group]) acc[group] = [];
    acc[group].push(s);
    return acc;
  }, {});

  // Esc 关闭弹窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowWizard(false);
        setEditingServer(null);
        setDeletingServer(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const inputClass =
    "w-full pl-7 pr-2.5 py-1.5 rounded-md text-helper text-primary outline-none placeholder-tertiary bg-base border border-border-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all duration-150";

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-border-subtle flex-shrink-0">
        <span className="text-helper font-medium text-secondary uppercase tracking-wide">服务器</span>
        <button
          className="w-5 h-5 rounded flex items-center justify-center text-tertiary hover:text-accent hover:bg-accent-soft transition-all duration-150"
          onClick={() => setShowWizard(true)}
          title="添加服务器"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* 搜索框 */}
      {servers.length > 0 && (
        <div className="px-2.5 py-2 flex-shrink-0">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary" width="11" height="11" viewBox="0 0 12 12" fill="none">
              <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 8L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <input
              className={inputClass}
              placeholder="搜索服务器..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mx-2 mt-2 px-2.5 py-2 rounded-md bg-danger-soft border border-danger/20 animate-fade-in">
          <div className="text-label text-danger">{error}</div>
        </div>
      )}

      {/* 服务器列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {Object.entries(groups).map(([groupName, groupServers]) => (
          <div key={groupName}>
            <div className="text-label text-tertiary uppercase tracking-widest px-2 mb-1.5 font-medium">
              {groupName}
            </div>
            <div className="space-y-px">
              {groupServers.map((server) => {
                const status = connectionStatus[server.id] || "disconnected";
                return (
                  <div
                    key={server.id}
                    className="group flex items-center gap-2.5 px-2 py-2 rounded-md cursor-pointer hover:bg-elevated active:bg-elevated transition-all duration-100"
                    onClick={() => handleConnect(server.id, server.name)}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-helper text-primary truncate leading-tight">{server.name}</div>
                      <div className="text-label text-tertiary truncate font-mono mt-0.5">
                        {server.username}@{server.host}:{server.port}
                      </div>
                    </div>
                    {connecting === server.id && (
                      <svg className="w-3 h-3 text-warning animate-spin" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 12" />
                      </svg>
                    )}
                    <button
                      className="opacity-0 group-hover:opacity-100 text-disabled hover:text-accent transition-all duration-150 p-0.5"
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
                      className="opacity-0 group-hover:opacity-100 text-disabled hover:text-danger transition-all duration-150 p-0.5"
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
            <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-elevated border border-border-subtle flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-tertiary">
                <rect x="2" y="3" width="20" height="7" rx="2" />
                <rect x="2" y="14" width="20" height="7" rx="2" />
                <circle cx="6" cy="6.5" r="1" fill="currentColor" />
                <circle cx="6" cy="17.5" r="1" fill="currentColor" />
              </svg>
            </div>
            <div className="text-helper text-tertiary mb-1">还没有服务器</div>
            <button
              className="text-helper text-accent hover:text-accent-hover transition-colors"
              onClick={() => setShowWizard(true)}
            >
              + 添加第一台
            </button>
          </div>
        )}

        {servers.length > 0 && filtered.length === 0 && (
          <div className="text-center py-8 text-helper text-tertiary">
            没有匹配的服务器
          </div>
        )}
      </div>

      {/* 底部状态 */}
      <div className="px-3 py-2 border-t border-border-subtle flex-shrink-0">
        <div className="text-label text-disabled">
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] animate-fade-in"
          onClick={(e) => e.target === e.currentTarget && setDeletingServer(null)}
        >
          <div className="w-80 rounded-xl p-5 shadow-2xl bg-surface border border-border-subtle animate-slide-in">
            <h3 className="text-title font-medium text-primary mb-2">删除服务器</h3>
            <p className="text-helper text-secondary mb-1">
              确定要删除 <span className="text-primary">{deletingServer.name}</span> 吗？
            </p>
            <p className="text-label text-tertiary font-mono mb-4">
              {deletingServer.username}@{deletingServer.host}:{deletingServer.port}
            </p>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-lg text-helper text-secondary bg-elevated border border-border-subtle hover:text-primary transition-colors"
                onClick={() => setDeletingServer(null)}
              >
                取消
              </button>
              <button
                className="flex-1 py-2 rounded-lg text-helper font-medium text-white bg-danger hover:bg-danger/90 transition-colors"
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
