import { useState, useEffect } from "react";
import { hostkeyService } from "@/services/hostkeyService";
import type { HostKeyVerifyEvent, HostKeyDecision } from "@/types/hostkey";

export function HostKeyVerifyModal({
  prompt,
  onResolved,
}: {
  prompt: HostKeyVerifyEvent;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const decide = async (decision: HostKeyDecision) => {
    setBusy(true);
    try {
      await hostkeyService.decide(prompt.token, decision);
    } catch (e) {
      console.error("host_key_decision 调用失败", e);
    } finally {
      setBusy(false);
      onResolved();
    }
  };

  const isChanged = prompt.action === "changed";

  // Esc = reject
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) decide("reject");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-[2px] animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !busy && decide("reject")}
    >
      <div className="w-[420px] rounded-xl p-5 shadow-2xl bg-surface border border-border-subtle animate-slide-in">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ background: isChanged ? "var(--warning)" : "var(--accent)" }}
          />
          <h3 className="text-title font-semibold text-primary">
            {isChanged ? "主机指纹已变更" : "确认主机指纹"}
          </h3>
        </div>

        <p className="text-helper text-secondary leading-relaxed mb-3">
          {isChanged
            ? "该服务器的 SSH 指纹与已记录的不一致，可能发生了中间人攻击或服务器重装。请确认后再连接。"
            : "这是你首次连接该服务器。请核对指纹是否与对方管理员提供的一致。"}
        </p>

        <div className="rounded-lg p-3 mb-4 bg-base border border-border-subtle space-y-1.5">
          <div className="flex justify-between text-label">
            <span className="text-tertiary">主机</span>
            <span className="text-secondary font-mono">
              {prompt.host}:{prompt.port}
            </span>
          </div>
          <div className="flex justify-between text-label">
            <span className="text-tertiary">SHA256 指纹</span>
            <span className="text-secondary font-mono break-all text-right">
              {prompt.fingerprint}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            className="w-full py-2 rounded-lg text-helper font-medium text-white bg-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
            disabled={busy}
            onClick={() => decide("accept-and-save")}
          >
            {isChanged ? "仍然信任并更新记录" : "信任并记住此主机"}
          </button>
          <button
            className="w-full py-2 rounded-lg text-helper text-secondary bg-elevated border border-border-subtle hover:text-primary transition-colors disabled:opacity-50"
            disabled={busy}
            onClick={() => decide("accept-once")}
          >
            仅本次连接（不再询问）
          </button>
          <button
            className="w-full py-2 rounded-lg text-helper text-danger bg-transparent hover:bg-danger-soft transition-colors disabled:opacity-50"
            disabled={busy}
            onClick={() => decide("reject")}
          >
            取消连接
          </button>
        </div>
      </div>
    </div>
  );
}
