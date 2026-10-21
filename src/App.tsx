import { isTauri } from "@tauri-apps/api/core";
import { Notice } from "@/components/common/Notice";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { reportError } from "@/lib/errors";
import { useEffect, useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useSSHEvents } from "@/hooks/useSSHEvents";
import { useServerStore } from "@/stores/useServerStore";
import { useCommandStore } from "@/stores/useCommandStore";
import { HostKeyVerifyModal } from "@/components/connection/HostKeyVerifyModal";
import type { TerminalOutputEvent } from "@/types/terminal";
import type { HostKeyVerifyEvent } from "@/types/hostkey";

function DesktopApp() {
  const fetchServers = useServerStore((s) => s.fetchServers);
  const fetchCommands = useCommandStore((s) => s.fetchCommands);

  // 终端输出分发器：通过 ref 避免重渲染
  const outputHandlerRef = useRef<(event: TerminalOutputEvent) => void>(() => {});

  // Host Key 验证弹窗状态
  const [hostKeyPrompt, setHostKeyPrompt] = useState<HostKeyVerifyEvent[]>([]);

  const handleTerminalOutput = useCallback((event: TerminalOutputEvent) => {
    outputHandlerRef.current(event);
  }, []);

  const handleHostKeyVerify = useCallback((event: HostKeyVerifyEvent) => {
    setHostKeyPrompt((queue) => [...queue, event]);
  }, []);

  const eventsReady = useSSHEvents(handleTerminalOutput, handleHostKeyVerify);

  useEffect(() => {
    fetchServers();
    fetchCommands();
    useSettingsStore.getState().load().catch(reportError);
  }, [fetchServers, fetchCommands]);


  return (
    <>
      {eventsReady ? <AppShell outputHandlerRef={outputHandlerRef} /> : <div className="h-screen flex items-center justify-center text-secondary">正在启动 SSH 工作区…</div>}
      <Notice />
      {hostKeyPrompt[0] && (
        <HostKeyVerifyModal
          key={hostKeyPrompt[0].token}
          prompt={hostKeyPrompt[0]}
          onResolved={() => setHostKeyPrompt((queue) => queue.slice(1))}
        />
      )}
    </>
  );
}

export default function App() {
  if (!isTauri()) return <div className="h-screen flex flex-col items-center justify-center gap-3 text-secondary"><h1 className="text-title text-primary">SSHEasy 桌面应用</h1><p>SSH 和安全存储需要桌面运行环境。</p><code className="px-4 py-2 bg-surface rounded">npm run tauri dev</code></div>;
  return <DesktopApp />;
}
