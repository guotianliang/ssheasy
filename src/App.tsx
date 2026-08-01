import { useEffect, useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useSSHEvents } from "@/hooks/useSSHEvents";
import { useServerStore } from "@/stores/useServerStore";
import { useCommandStore } from "@/stores/useCommandStore";
import { HostKeyVerifyModal } from "@/components/connection/HostKeyVerifyModal";
import type { TerminalOutputEvent } from "@/types/terminal";
import type { HostKeyVerifyEvent } from "@/types/hostkey";

export default function App() {
  const fetchServers = useServerStore((s) => s.fetchServers);
  const fetchCommands = useCommandStore((s) => s.fetchCommands);

  // 终端输出分发器：通过 ref 避免重渲染
  const outputHandlerRef = useRef<(event: TerminalOutputEvent) => void>(() => {});

  // Host Key 验证弹窗状态
  const [hostKeyPrompt, setHostKeyPrompt] = useState<HostKeyVerifyEvent | null>(null);

  const handleTerminalOutput = useCallback((event: TerminalOutputEvent) => {
    outputHandlerRef.current(event);
  }, []);

  const handleHostKeyVerify = useCallback((event: HostKeyVerifyEvent) => {
    setHostKeyPrompt(event);
  }, []);

  useSSHEvents(handleTerminalOutput, handleHostKeyVerify);

  useEffect(() => {
    fetchServers();
    fetchCommands();
  }, [fetchServers, fetchCommands]);

  return (
    <>
      <AppShell outputHandlerRef={outputHandlerRef} />
      {hostKeyPrompt && (
        <HostKeyVerifyModal
          prompt={hostKeyPrompt}
          onResolved={() => setHostKeyPrompt(null)}
        />
      )}
    </>
  );
}
