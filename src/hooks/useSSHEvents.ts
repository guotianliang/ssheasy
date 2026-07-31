import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { EVENTS } from "@/types/events";
import type { TerminalOutputEvent, ConnectionStatusEvent } from "@/types/terminal";
import { useServerStore } from "@/stores/useServerStore";
import { useTerminalStore } from "@/stores/useTerminalStore";

/**
 * 全局监听后端推送的 SSH 事件
 * 在 App 根组件中调用一次
 */
export function useSSHEvents(
  onTerminalOutput: (event: TerminalOutputEvent) => void
) {
  const setConnectionStatus = useServerStore((s) => s.setConnectionStatus);

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    // 终端输出
    unlisteners.push(
      listen<TerminalOutputEvent>(EVENTS.TERMINAL_OUTPUT, (event) => {
        onTerminalOutput(event.payload);
      })
    );

    // 连接状态变化
    unlisteners.push(
      listen<ConnectionStatusEvent>(EVENTS.CONNECTION_STATUS, (event) => {
        const { serverId, sessionId, status, message } = event.payload;
        if (serverId) {
          setConnectionStatus(serverId, status);
        }
        // 同步更新对应 tab 的状态（断线时显示重连入口）
        if (sessionId && status === "disconnected") {
          useTerminalStore.getState().markDisconnected(sessionId, message);
        }
      })
    );

    return () => {
      unlisteners.forEach((p) => p.then((unlisten) => unlisten()));
    };
  }, [onTerminalOutput, setConnectionStatus]);
}
