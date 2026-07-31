import { useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useSSHEvents } from "@/hooks/useSSHEvents";
import { useServerStore } from "@/stores/useServerStore";
import { useCommandStore } from "@/stores/useCommandStore";
import type { TerminalOutputEvent } from "@/types/terminal";

export default function App() {
  const fetchServers = useServerStore((s) => s.fetchServers);
  const fetchCommands = useCommandStore((s) => s.fetchCommands);

  // 终端输出分发器：通过 ref 避免重渲染
  const outputHandlerRef = useRef<(event: TerminalOutputEvent) => void>(() => {});

  const handleTerminalOutput = useCallback((event: TerminalOutputEvent) => {
    outputHandlerRef.current(event);
  }, []);

  useSSHEvents(handleTerminalOutput);

  useEffect(() => {
    fetchServers();
    fetchCommands();
  }, [fetchServers, fetchCommands]);

  return <AppShell outputHandlerRef={outputHandlerRef} />;
}
