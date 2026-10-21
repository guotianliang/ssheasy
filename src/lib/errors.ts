import { create } from "zustand";

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (e.error) return errorMessage(e.error);
    if (typeof e.humanMsg === "string") return e.humanMsg;
    if (typeof e.message === "string") return e.message;
  }
  return "操作失败，请重试";
}
export const useNoticeStore = create<{ message: string | null; show: (error: unknown) => void; clear: () => void }>((set) => ({
  message: null,
  show: (error) => set({ message: errorMessage(error) }),
  clear: () => set({ message: null }),
}));
export const reportError = (error: unknown) => useNoticeStore.getState().show(error);
export async function runAction(action: () => Promise<unknown>): Promise<void> {
  try { await action(); } catch (error) { reportError(error); }
}
