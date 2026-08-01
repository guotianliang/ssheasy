import { create } from "zustand";
import type { FileEntry } from "@/types/sftp";
import { sftpService } from "@/services/sftpService";

/** 主区域视图模式：终端 / 文件浏览 / 操作日志 */
export type WorkspaceView = "terminal" | "files" | "logs";

interface SftpState {
  /** 当前主区域视图 */
  viewMode: WorkspaceView;
  /** 已加载条目所属的 serverId */
  loadedServerId: string | null;
  /** 当前浏览路径 */
  currentPath: string;
  /** 当前服务器家目录缓存 */
  homePath: string;
  entries: FileEntry[];
  loading: boolean;
  error: string | null;

  /** 文件预览 */
  previewFile: FileEntry | null;
  previewContent: string;
  previewLoading: boolean;
  previewError: string | null;

  setViewMode: (mode: WorkspaceView) => void;
  openPath: (serverId: string, path: string) => Promise<void>;
  goHome: (serverId: string) => Promise<void>;
  goUp: (serverId: string) => Promise<void>;
  refresh: (serverId: string) => Promise<void>;
  reset: () => void;

  previewFile_: (serverId: string, file: FileEntry) => Promise<void>;
  closePreview: () => void;
}

function parentOf(path: string): string {
  if (path === "/") return "/";
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
}

export const useSftpStore = create<SftpState>((set, get) => ({
  viewMode: "terminal",
  loadedServerId: null,
  currentPath: "",
  homePath: "",
  entries: [],
  loading: false,
  error: null,

  previewFile: null,
  previewContent: "",
  previewLoading: false,
  previewError: null,

  setViewMode: (mode) => set({ viewMode: mode }),

  openPath: async (serverId, path) => {
    const switchedServer = get().loadedServerId !== serverId;
    set({ loading: true, error: null, ...(switchedServer ? { homePath: "" } : {}) });
    try {
      const entries = await sftpService.listDir(serverId, path);
      set({ entries, currentPath: path, loadedServerId: serverId, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  goHome: async (serverId) => {
    let home = get().homePath;
    if (!home || get().loadedServerId !== serverId) {
      set({ loading: true, error: null });
      try {
        home = await sftpService.home(serverId);
        set({ homePath: home });
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : String(e) });
        return;
      }
    }
    await get().openPath(serverId, home);
  },

  goUp: async (serverId) => {
    const current = get().currentPath;
    if (!current) return;
    await get().openPath(serverId, parentOf(current));
  },

  refresh: async (serverId) => {
    const current = get().currentPath;
    if (current) await get().openPath(serverId, current);
  },

  reset: () =>
    set({
      loadedServerId: null,
      currentPath: "",
      homePath: "",
      entries: [],
      error: null,
      previewFile: null,
      previewContent: "",
      previewError: null,
    }),

  previewFile_: async (serverId, file) => {
    set({ previewLoading: true, previewError: null, previewFile: file, previewContent: "" });
    try {
      const result = await sftpService.readFile(serverId, file.path);
      set({ previewContent: result.content, previewLoading: false });
    } catch (e) {
      set({ previewLoading: false, previewError: e instanceof Error ? e.message : String(e) });
    }
  },

  closePreview: () =>
    set({ previewFile: null, previewContent: "", previewError: null }),
}));
