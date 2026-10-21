import { useNoticeStore } from "@/lib/errors";
export function Notice() {
  const { message, clear } = useNoticeStore();
  if (!message) return null;
  return <div role="alert" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] flex items-start gap-4 max-w-lg px-4 py-3 rounded-lg bg-surface border border-danger/40 shadow-xl text-helper text-danger">
    <span className="break-words">{message}</span><button onClick={clear} className="shrink-0 text-secondary hover:text-primary" aria-label="关闭错误提示">关闭</button>
  </div>;
}
