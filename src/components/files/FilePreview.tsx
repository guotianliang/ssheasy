import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useSftpStore } from "@/stores/useSftpStore";

export function FilePreview() {
  const { previewFile, previewContent, previewLoading, previewError, closePreview } = useSftpStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const contentRef = useRef<HTMLPreElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);

  // 找到所有匹配位置
  const matches = useMemo(() => {
    if (!searchQuery.trim() || !previewContent) return [] as number[];
    const indices: number[] = [];
    const query = searchQuery.toLowerCase();
    const content = previewContent.toLowerCase();
    let idx = content.indexOf(query);
    while (idx !== -1) {
      indices.push(idx);
      idx = content.indexOf(query, idx + query.length);
    }
    return indices;
  }, [searchQuery, previewContent]);

  // 重置匹配索引
  useEffect(() => {
    setCurrentMatchIdx(0);
  }, [searchQuery]);

  // 滚动到当前匹配
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentMatchIdx]);

  const handleSearchKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        setCurrentMatchIdx((i) => (i - 1 + matches.length) % matches.length);
      } else {
        setCurrentMatchIdx((i) => (i + 1) % matches.length);
      }
    }
  }, [matches.length]);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePreview]);

  if (!previewFile) return null;

  // 渲染带高亮的内容
  const renderContent = () => {
    if (!previewContent) return null;
    if (matches.length === 0) return previewContent;

    const query = searchQuery.toLowerCase();
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;

    matches.forEach((matchIdx, i) => {
      if (matchIdx > lastIdx) {
        parts.push(previewContent.slice(lastIdx, matchIdx));
      }
      parts.push(
        <span
          key={i}
          ref={i === currentMatchIdx ? highlightRef : undefined}
          className={
            i === currentMatchIdx
              ? "bg-accent text-white rounded px-0.5"
              : "bg-accent-soft text-accent rounded px-0.5"
          }
        >
          {previewContent.slice(matchIdx, matchIdx + query.length)}
        </span>
      );
      lastIdx = matchIdx + query.length;
    });

    if (lastIdx < previewContent.length) {
      parts.push(previewContent.slice(lastIdx));
    }

    return parts;
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-base">
      {/* 顶部栏 */}
      <div className="h-10 flex items-center gap-3 px-3 border-b border-border-subtle bg-surface flex-shrink-0">
        <button
          onClick={closePreview}
          className="flex items-center gap-1 text-secondary hover:text-primary transition-colors text-body"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          返回
        </button>
        <div className="w-px h-4 bg-border-subtle" />
        <span className="text-body text-primary font-medium truncate">{previewFile.name}</span>
        <span className="text-label text-tertiary flex-shrink-0">
          {(previewFile.size / 1024).toFixed(1)} KB
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={closePreview}
            className="w-6 h-6 flex items-center justify-center text-tertiary hover:text-primary hover:bg-elevated rounded transition-colors"
            title="关闭 (Esc)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="h-9 flex items-center gap-2 px-3 border-b border-border-subtle bg-surface flex-shrink-0">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-tertiary flex-shrink-0">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKey}
          placeholder="搜索内容…"
          className="flex-1 bg-transparent text-body text-primary placeholder:text-disabled outline-none"
          autoFocus
        />
        {searchQuery.trim() && (
          <>
            <span className="text-label text-tertiary flex-shrink-0">
              {matches.length > 0 ? `${currentMatchIdx + 1}/${matches.length}` : "无匹配"}
            </span>
            <button
              onClick={() => setCurrentMatchIdx((i) => (i - 1 + matches.length) % matches.length)}
              disabled={matches.length === 0}
              className="w-5 h-5 flex items-center justify-center text-tertiary hover:text-primary disabled:opacity-30 transition-colors"
              title="上一个 (Shift+Enter)"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M6 3L3 6L6 9M9 3L6 6L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentMatchIdx((i) => (i + 1) % matches.length)}
              disabled={matches.length === 0}
              className="w-5 h-5 flex items-center justify-center text-tertiary hover:text-primary disabled:opacity-30 transition-colors"
              title="下一个 (Enter)"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M3 3L6 6L3 9M6 3L9 6L6 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-h-0 overflow-auto">
        {previewLoading && (
          <div className="flex items-center justify-center h-full text-secondary text-body">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
            加载中…
          </div>
        )}
        {previewError && !previewLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span className="text-danger text-body">⚠ {previewError}</span>
          </div>
        )}
        {!previewLoading && !previewError && (
          <pre
            ref={contentRef}
            className="text-body text-primary font-mono leading-relaxed p-4 whitespace-pre-wrap break-all"
            style={{ fontSize: "13px", fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace" }}
          >
            {renderContent()}
          </pre>
        )}
      </div>
    </div>
  );
}
