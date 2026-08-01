import { useEffect, useState } from "react";
import { usePathBookmarkStore } from "@/stores/usePathBookmarkStore";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useSftpStore } from "@/stores/useSftpStore";
import { terminalService } from "@/services/terminalService";

export function PathBookmarkPanel() {
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const sessions = useTerminalStore((s) => s.sessions);
  const { bookmarks, loadedServerId, fetchBookmarks, addBookmark, deleteBookmark } =
    usePathBookmarkStore();
  const viewMode = useSftpStore((s) => s.viewMode);
  const openPath = useSftpStore((s) => s.openPath);

  const [showAdd, setShowAdd] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [labelInput, setLabelInput] = useState("");

  const activeServerId = sessions.find((s) => s.sessionId === activeSessionId)?.serverId ?? null;

  useEffect(() => {
    if (activeServerId && activeServerId !== loadedServerId) {
      fetchBookmarks(activeServerId);
    }
  }, [activeServerId, loadedServerId, fetchBookmarks]);

  const handleJump = (path: string) => {
    if (!activeServerId) return;
    if (viewMode === "files") {
      openPath(activeServerId, path);
    } else if (activeSessionId) {
      terminalService.sendInput(activeSessionId, `cd ${path}\n`);
    }
  };

  const handleAdd = async () => {
    const path = pathInput.trim();
    if (!path || !activeServerId) return;
    await addBookmark({
      serverId: activeServerId,
      path,
      label: labelInput.trim() || undefined,
    });
    setPathInput("");
    setLabelInput("");
    setShowAdd(false);
  };

  if (!activeServerId) return null;

  const inputClass =
    "w-full px-2.5 py-1.5 rounded-md text-helper text-primary outline-none placeholder-tertiary bg-base border border-border-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all duration-150";

  return (
    <div className="border-t border-border-subtle flex-shrink-0">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-label font-medium text-tertiary uppercase tracking-wide">
          路径书签
        </span>
        <button
          className="w-4 h-4 rounded flex items-center justify-center text-disabled hover:text-accent hover:bg-accent-soft transition-all"
          onClick={() => setShowAdd((v) => !v)}
          title="收藏当前路径"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* 新增表单 */}
      {showAdd && (
        <div className="px-2.5 pb-2 space-y-1.5 animate-fade-in">
          <input
            className={`${inputClass} font-mono`}
            placeholder="/data/app/logs（可在终端先 pwd）"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            autoFocus
          />
          <input
            className={inputClass}
            placeholder="备注名（可选，如：日志目录）"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <div className="flex gap-1.5">
            <button
              className="flex-1 py-1 rounded text-label text-tertiary bg-elevated border border-border-subtle hover:text-secondary transition-colors"
              onClick={() => setShowAdd(false)}
            >
              取消
            </button>
            <button
              className="flex-1 py-1 rounded text-label font-medium text-white transition-colors disabled:opacity-40"
              style={{ background: pathInput.trim() ? "var(--accent)" : "var(--border-subtle)" }}
              disabled={!pathInput.trim()}
              onClick={handleAdd}
            >
              收藏
            </button>
          </div>
        </div>
      )}

      {/* 书签列表 */}
      <div className="px-2 pb-2 space-y-0.5 max-h-40 overflow-y-auto">
        {bookmarks.map((bm) => (
          <div
            key={bm.id}
            className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent-soft transition-colors duration-150"
            onClick={() => handleJump(bm.path)}
            title={`cd ${bm.path}`}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
              <path
                d="M1.5 4C1.5 3.17 2.17 2.5 3 2.5H6L7.5 4.5H13C13.83 4.5 14.5 5.17 14.5 6V11.5C14.5 12.33 13.83 13 13 13H3C2.17 13 1.5 12.33 1.5 11.5V4Z"
                stroke="var(--text-tertiary)"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex-1 min-w-0">
              {bm.label && (
                <div className="text-helper text-primary truncate leading-tight">{bm.label}</div>
              )}
              <div className="text-label text-disabled font-mono truncate">{bm.path}</div>
            </div>
            <button
              className="opacity-0 group-hover:opacity-100 text-disabled hover:text-danger transition-all p-0.5 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                deleteBookmark(bm.id);
              }}
              title="删除"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
        {bookmarks.length === 0 && !showAdd && (
          <div className="text-center text-label text-disabled py-2">
            点 + 收藏常用目录，点击即可 cd 进入
          </div>
        )}
      </div>
    </div>
  );
}
