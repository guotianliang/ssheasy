import type { MutableRefObject } from "react";
import { TerminalPanel } from "@/components/terminal/TerminalPanel";
import { FileBrowser } from "@/components/files/FileBrowser";
import { LogPanel } from "@/components/logs/LogPanel";
import { useSftpStore } from "@/stores/useSftpStore";
import type { TerminalOutputEvent } from "@/types/terminal";

interface WorkspacePanelProps {
  outputHandlerRef: MutableRefObject<(event: TerminalOutputEvent) => void>;
}

export function WorkspacePanel({ outputHandlerRef }: WorkspacePanelProps) {
  const viewMode = useSftpStore((s) => s.viewMode);

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex-1 min-h-0 flex flex-col"
        style={{ display: viewMode === "terminal" ? "flex" : "none" }}
      >
        <TerminalPanel outputHandlerRef={outputHandlerRef} />
      </div>
      {viewMode === "files" && <FileBrowser />}
      {viewMode === "logs" && <LogPanel />}
    </div>
  );
}
