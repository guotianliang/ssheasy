import { useEffect, useState } from "react";
import { useSftpStore } from "@/stores/useSftpStore";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { usePathBookmarkStore } from "@/stores/usePathBookmarkStore";
import { ViewSwitch } from "@/components/layout/ViewSwitch";
import { FilePreview } from "@/components/files/FilePreview";
import { isPreviewable, type FileEntry } from "@/types/sftp";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
}

function breadcrumbs(path: string): { label: string; path: string }[] {
  if (!path || path === "/") return [{ label: "/", path: "/" }];
  const parts = path.split("/").filter(Boolean);
  const crumbs = [{ label: "/", path: "/" }];
  let acc = "";
  for (const p of parts) {
    acc += `/${p}`;
    crumbs.push({ label: p, path: acc });
  }
  return crumbs;
}

export function FileBrowser() {
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const sessions = useTerminalStore((s) => s.sessions);
  const {
    loadedServerId,
    currentPath,
    entries,
    loading,
    error,
    openPath,
    goHome,
    goUp,
    refresh,
    upload,
    download,
    remove,
    rename,
    transfer,
    clearTransferError,
  } = useSftpStore();
  const addBookmark = usePathBookmarkStore((s) => s.addBookmark);
  const previewFile_ = useSftpStore((s) => s.previewFile_);
  const previewFile = useSftpStore((s) => s.previewFile);

  const [selected, setSelected] = useState<string | null>(null);
  const [justStarred, setJustStarred] = useState(false);
  const [renaming, setRenaming] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const activeServerId =
    sessions.find((s) => s.sessionId === activeSessionId)?.serverId ?? null;

  useEffect(() => {
    if (activeServerId && loadedServerId !== activeServerId) {
      goHome(activeServerId);
    }
  }, [activeServerId, loadedServerId, goHome]);

  useEffect(() => setSelected(null), [currentPath]);

  const handleStar = async () => {
    if (!activeServerId || !currentPath) return;
    await addBookmark({ serverId: activeServerId, path: currentPath });
    setJustStarred(true);
    setTimeout(() => setJustStarred(false), 1500);
  };

  const handleEntryClick = (entry: FileEntry) => {
    if (entry.isDir) {
      if (activeServerId) openPath(activeServerId, entry.path);
    } else {
      setSelected(entry.path);
    }
  };

  // 双击文件：可预览的文本文件直接预览，其他提示
  const handleEntryDoubleClick = (entry: FileEntry) => {
    if (entry.isDir) return;
    if (isPreviewable(entry.name) && activeServerId) {
      previewFile_(activeServerId, entry);
    }
  };

  if (!activeServerId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-helper text-tertiary">请先在终端连接一台服务器</div>
      </div>
    );
  }

  const crumbs = breadcrumbs(currentPath);
  const tooMany = entries.length > 500;

  return (
    <div className="flex flex-col h-full bg-base relative">
      {/* 头部：面包屑 + 视图切换 */}
      <div className="flex items-center gap-2 h-9 px-2 border-b border-border-subtle bg-surface flex-shrink-0">
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <ToolButton title="上级目录" onClick={() => activeServerId && goUp(activeServerId)}>
            <path d="M6 2.5L2.5 6L6 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2.5 6H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </ToolButton>
          <ToolButton title="家目录" onClick={() => activeServerId && goHome(activeServerId)}>
            <path d="M2.5 6L6 2.5L9.5 6V10.5H2.5V6Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </ToolButton>
          <ToolButton title="刷新" onClick={() => activeServerId && refresh(activeServerId)}>
            <path d="M10 6a4 4 0 1 1-1.2-2.85M10 1.5v2.4H7.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </ToolButton>
          <div className="w-px h-4 bg-border-subtle mx-1" />
          <ToolButton title="上传文件" onClick={() => activeServerId && upload(activeServerId)}>
            <path d="M6 2.5V9M6 2.5L3.5 5M6 2.5L8.5 5M2.5 10.5V11.5H9.5V10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </ToolButton>
          <ToolButton
            title={selected ? "下载选中文件" : "先点击选中一个文件"}
            onClick={() => {
              const target = selected ? entries.find((e) => e.path === selected) : null;
              if (target && !target.isDir && activeServerId) download(activeServerId, target);
            }}
            disabled={!selected || !entries.find((e) => e.path === selected)}
          >
            <path d="M6 8.5V2M6 8.5L3.5 6M6 8.5L8.5 6M2.5 9.5V10.5H9.5V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </ToolButton>
          <ToolButton
            title={selected ? "删除选中项" : "先点击选中一个文件"}
            danger
            disabled={!selected}
            onClick={() => {
              const target = selected ? entries.find((e) => e.path === selected) : null;
              if (!target || !activeServerId) return;
              const label = target.isDir ? `目录「${target.name}」及其内容` : `文件「${target.name}」`;
              if (window.confirm(`确定删除${label}？此操作不可恢复。`)) {
                remove(activeServerId, target);
              }
            }}
          >
            <path d="M3 3.5H9M4.5 3.5V2.5H7.5V3.5M4 3.5V10H8V3.5M5 5V8.5M7 5V8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </ToolButton>
          <ToolButton
            title={selected ? "重命名选中项" : "先点击选中一个文件"}
            disabled={!selected}
            onClick={() => {
              const target = selected ? entries.find((e) => e.path === selected) : null;
              if (!target) return;
              setRenaming(target);
              setRenameValue(target.name);
            }}
          >
            <path d="M7.5 2.5L9.5 4.5L3.5 10.5L1.5 10.5L1.5 8.5L7.5 2.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            <path d="M6.5 3.5L8.5 5.5" stroke="currentColor" strokeWidth="1.1" />
          </ToolButton>
          <ToolButton
            title={justStarred ? "已收藏到路径书签" : "收藏此目录到路径书签"}
            onClick={handleStar}
            highlight={justStarred}
          >
            <path
              d="M6 1.5L7.4 4.3L10.5 4.8L8.25 7L8.8 10.1L6 8.6L3.2 10.1L3.75 7L1.5 4.8L4.6 4.3L6 1.5Z"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinejoin="round"
              fill={justStarred ? "currentColor" : "none"}
            />
          </ToolButton>
        </div>

        {/* 面包屑 */}
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto text-helper font-mono">
          {crumbs.map((c, i) => (
            <span key={c.path} className="flex items-center gap-0.5 flex-shrink-0">
              {i > 0 && <span className="text-disabled">/</span>}
              <button
                className={`px-1 rounded hover:bg-elevated transition-colors ${
                  i === crumbs.length - 1 ? "text-primary" : "text-tertiary hover:text-secondary"
                }`}
                onClick={() => activeServerId && openPath(activeServerId, c.path)}
              >
                {c.label}
              </button>
            </span>
          ))}
        </div>

        <div className="flex-shrink-0">
          <ViewSwitch />
        </div>
      </div>

      {/* 列头 */}
      <div className="flex items-center px-3 h-7 border-b border-border-subtle text-label text-tertiary flex-shrink-0">
        <div className="flex-1 min-w-0">名称</div>
        <div className="w-20 text-right flex-shrink-0">大小</div>
        <div className="w-32 text-right flex-shrink-0">修改时间</div>
      </div>

      {/* 列表主体 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-10 text-helper text-tertiary">
            <span className="w-3 h-3 mr-2 border border-tertiary border-t-accent rounded-full animate-spin" />
            加载中…
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <div className="text-helper text-danger/80 max-w-xs text-center px-4">{error}</div>
            <button
              className="px-3 py-1 rounded text-label text-secondary bg-elevated border border-border-subtle hover:text-primary transition-colors"
              onClick={() => activeServerId && refresh(activeServerId)}
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="flex items-center justify-center py-10 text-helper text-disabled">
            空目录
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <>
            {tooMany && (
              <div className="px-3 py-1.5 text-label text-warning/70 bg-warning-soft border-b border-warning/10">
                该目录有 {entries.length} 个条目，渲染可能较慢
              </div>
            )}
            {entries.map((entry) => (
              <FileRow
                key={entry.path}
                entry={entry}
                selected={selected === entry.path}
                onClick={() => handleEntryClick(entry)}
                onDoubleClick={() => handleEntryDoubleClick(entry)}
              />
            ))}
          </>
        )}
      </div>

      {/* 文件预览覆盖层 */}
      {previewFile && <FilePreview />}

      {/* 传输进度条 */}
      {transfer.active && (
        <div className="absolute bottom-0 left-0 right-0 z-20 px-3 py-1.5 bg-surface border-t border-border-subtle flex items-center gap-2">
          <span className="w-3 h-3 border border-tertiary border-t-accent rounded-full animate-spin flex-shrink-0" />
          <span className="text-label text-secondary truncate flex-shrink-0">
            {transfer.kind === "upload" ? "上传" : "下载"} {transfer.fileName}
          </span>
          <div className="flex-1 h-1 bg-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${transfer.progress}%` }}
            />
          </div>
          <span className="text-label text-tertiary w-8 text-right">{transfer.progress}%</span>
        </div>
      )}
      {transfer.error && !transfer.active && (
        <div className="absolute bottom-0 left-0 right-0 z-20 px-3 py-2 bg-danger-soft border-t border-danger/20 flex items-center gap-2 animate-fade-in">
          <span className="text-label text-danger flex-1 truncate">{transfer.error}</span>
          <button
            className="text-label text-tertiary hover:text-primary flex-shrink-0"
            onClick={clearTransferError}
          >
            关闭
          </button>
        </div>
      )}

      {/* 重命名弹窗 */}
      {renaming && (
        <div
          className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center animate-fade-in"
          onClick={() => setRenaming(null)}
        >
          <div
            className="bg-surface border border-border-subtle rounded-xl p-4 w-72 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-body text-primary mb-3">重命名</div>
            <input
              className="w-full px-2.5 py-1.5 rounded-md text-helper text-primary outline-none bg-base border border-border-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
              value={renameValue}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameValue.trim() && activeServerId) {
                  rename(activeServerId, renaming, renameValue.trim());
                  setRenaming(null);
                }
                if (e.key === "Escape") setRenaming(null);
              }}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                className="px-3 py-1 rounded-md text-helper text-secondary hover:text-primary hover:bg-elevated transition-colors"
                onClick={() => setRenaming(null)}
              >
                取消
              </button>
              <button
                className="px-3 py-1 rounded-md text-helper font-medium text-white bg-accent hover:bg-accent-hover transition-colors"
                onClick={() => {
                  if (renameValue.trim() && activeServerId) {
                    rename(activeServerId, renaming, renameValue.trim());
                  }
                  setRenaming(null);
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolButton({
  title,
  onClick,
  highlight,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  highlight?: boolean;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`w-6 h-6 rounded flex items-center justify-center transition-colors duration-150 ${
        disabled
          ? "text-disabled cursor-not-allowed"
          : danger
          ? "text-tertiary hover:text-danger hover:bg-danger-soft"
          : highlight
          ? "text-accent bg-accent-soft"
          : "text-tertiary hover:text-primary hover:bg-elevated"
      }`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        {children}
      </svg>
    </button>
  );
}

function FileRow({
  entry,
  selected,
  onClick,
  onDoubleClick,
}: {
  entry: FileEntry;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      className={`flex items-center px-3 h-8 cursor-pointer border-b border-border-subtle/50 transition-colors duration-100 ${
        selected ? "bg-accent-soft" : "hover:bg-elevated"
      }`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={entry.isDir ? `进入 ${entry.path}` : isPreviewable(entry.name) ? `双击预览 ${entry.path}` : entry.path}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <FileIcon entry={entry} />
        <span
          className={`truncate text-body ${
            entry.isDir ? "text-accent" : "text-secondary"
          }`}
        >
          {entry.name}
        </span>
        {entry.isSymlink && (
          <span className="text-label text-disabled flex-shrink-0">link</span>
        )}
      </div>
      <div className="w-20 text-right text-helper text-tertiary font-mono flex-shrink-0">
        {entry.isDir ? "-" : formatSize(entry.size)}
      </div>
      <div className="w-32 text-right text-helper text-tertiary font-mono flex-shrink-0">
        {entry.modified}
      </div>
    </div>
  );
}

function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.isDir) {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
        <path
          d="M1.5 4C1.5 3.17 2.17 2.5 3 2.5H6L7.5 4.5H13C13.83 4.5 14.5 5.17 14.5 6V11.5C14.5 12.33 13.83 13 13 13H3C2.17 13 1.5 12.33 1.5 11.5V4Z"
          fill="var(--accent-soft)"
          stroke="var(--accent)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (entry.isSymlink) {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
        <path
          d="M6 8.5L8.5 6M5 6.5L4 7.5a2.5 2.5 0 0 0 3.5 3.5l1-1M11 9.5l1-1a2.5 2.5 0 0 0-3.5-3.5l-1 1"
          stroke="var(--text-tertiary)"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <path
        d="M4 2.5H9.5L12 5V13.5H4V2.5Z"
        stroke="var(--text-tertiary)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M9.5 2.5V5H12" stroke="var(--text-tertiary)" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}
