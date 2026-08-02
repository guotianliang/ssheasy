import { useSftpStore } from "@/stores/useSftpStore";
import type { WorkspaceView } from "@/stores/useSftpStore";

export function ViewSwitch() {
  const viewMode = useSftpStore((s) => s.viewMode);
  const setViewMode = useSftpStore((s) => s.setViewMode);

  const item = (mode: WorkspaceView, label: string, icon: React.ReactNode) => {
    const active = viewMode === mode;
    return (
      <button
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-label font-medium transition-colors duration-150 ${
          active
            ? "bg-accent-soft text-accent"
            : "text-tertiary hover:text-secondary"
        }`}
        onClick={() => setViewMode(mode)}
        title={mode === "terminal" ? "切换到终端" : "切换到文件浏览"}
      >
        {icon}
        {label}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-0.5 bg-base border border-border-subtle rounded-md p-0.5">
      {item(
        "terminal",
        "终端",
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2 3L5 6L2 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6.5 9H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
      {item(
        "files",
        "文件",
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
          <path
            d="M1.5 4C1.5 3.17 2.17 2.5 3 2.5H6L7.5 4.5H13C13.83 4.5 14.5 5.17 14.5 6V11.5C14.5 12.33 13.83 13 13 13H3C2.17 13 1.5 12.33 1.5 11.5V4Z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {item(
        "logs",
        "日志",
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
          <path
            d="M2.5 3.5H13.5M2.5 8H13.5M2.5 12.5H9"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}
