import { create } from "zustand";
import type { FileEntry } from "@/types/sftp";
import { sftpService } from "@/services/sftpService";

/** 主区域视图模式：终端 / 文件浏览 / 操作日志 */
export type WorkspaceView = "terminal" | "files" | "logs";

/** 传输任务状态 */
export interface TransferState {
  active: boolean;
  kind: "upload" | "download" | null;
  fileName: string | null;
  progress: number; // 0-100
  error: string | null;
}

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

  /** 传输状态 */
  transfer: TransferState;

  setViewMode: (mode: WorkspaceView) => void;
  openPath: (serverId: string, path: string) => Promise<void>;
  goHome: (serverId: string) => Promise<void>;
  goUp: (serverId: string) => Promise<void>;
  refresh: (serverId: string) => Promise<void>;
  reset: () => void;

  previewFile_: (serverId: string, file: FileEntry) => Promise<void>;
  closePreview: () => void;

  download: (serverId: string, file: FileEntry) => Promise<void>;
  upload: (serverId: string, file?: File, targetDir?: string) => Promise<void>;
  remove: (serverId: string, file: FileEntry) => Promise<void>;
  rename: (serverId: string, file: FileEntry, newName: string) => Promise<void>;
  clearTransferError: () => void;
}

function parentOf(path: string): string {
  if (path === "/") return "/";
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
}

function joinRemote(dir: string, name: string): string {
  return dir.endsWith("/") ? dir + name : dir + "/" + name;
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/** 用 Tauri fs 插件把字节写入用户选择的本地路径（绝对路径，baseDir 省略） */
async function writeLocalFile(path: string, bytes: Uint8Array): Promise<void> {
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(path, bytes);
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

  transfer: { active: false, kind: null, fileName: null, progress: 0, error: null },

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

  download: async (serverId, file) => {
    set({
      transfer: { active: true, kind: "download", fileName: file.name, progress: 5, error: null },
    });
    try {
      // 后端一次读回 base64
      const result = await sftpService.download(serverId, file.path);
      set({ transfer: { active: true, kind: "download", fileName: file.name, progress: 70, error: null } });

      // 让用户选择保存位置
      const { save } = await import("@tauri-apps/plugin-dialog");
      const target = await save({
        title: "保存文件",
        defaultPath: result.name,
      });
      if (!target) {
        set({ transfer: { active: false, kind: null, fileName: null, progress: 0, error: null } });
        return; // 用户取消
      }

      // 解码并写本地文件
      const bytes = base64ToUint8Array(result.contentBase64);
      await writeLocalFile(target, bytes);

      set({ transfer: { active: false, kind: null, fileName: null, progress: 100, error: null } });
      setTimeout(() => set({ transfer: { active: false, kind: null, fileName: null, progress: 0, error: null } }), 1500);
    } catch (e) {
      set({
        transfer: {
          active: false,
          kind: null,
          fileName: null,
          progress: 0,
          error: e instanceof Error ? e.message : String(e),
        },
      });
    }
  },

  upload: async (serverId, _file, targetDir) => {
    const dir = targetDir || get().currentPath;
    if (!dir) return;

    // 让用户选择要上传的本地文件
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      title: "选择要上传的文件",
      multiple: false,
      directory: false,
    });
    if (!selected) return;
    const localPath = Array.isArray(selected) ? selected[0] : selected;
    const fileName = localPath.split(/[\\/]/).pop() || "upload";

    set({
      transfer: { active: true, kind: "upload", fileName, progress: 5, error: null },
    });
    try {
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const bytes = await readFile(localPath);
      const b64 = uint8ArrayToBase64(bytes);
      set({ transfer: { active: true, kind: "upload", fileName, progress: 40, error: null } });

      const remotePath = joinRemote(dir, fileName);
      await sftpService.upload(serverId, remotePath, b64);

      set({ transfer: { active: false, kind: null, fileName: null, progress: 100, error: null } });
      // 刷新目录
      await get().refresh(serverId);
      setTimeout(() => set({ transfer: { active: false, kind: null, fileName: null, progress: 0, error: null } }), 1500);
    } catch (e) {
      set({
        transfer: {
          active: false,
          kind: null,
          fileName: null,
          progress: 0,
          error: e instanceof Error ? e.message : String(e),
        },
      });
    }
  },

  remove: async (serverId, file) => {
    set({ transfer: { active: true, kind: "download", fileName: file.name, progress: 0, error: null } });
    try {
      await sftpService.remove(serverId, file.path);
      await get().refresh(serverId);
      set({ transfer: { active: false, kind: null, fileName: null, progress: 0, error: null } });
    } catch (e) {
      set({
        transfer: {
          active: false,
          kind: null,
          fileName: null,
          progress: 0,
          error: e instanceof Error ? e.message : String(e),
        },
      });
    }
  },

  rename: async (serverId, file, newName) => {
    try {
      const from = file.path;
      const to = joinRemote(parentOf(from), newName);
      await sftpService.rename(serverId, from, to);
      await get().refresh(serverId);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },

  clearTransferError: () =>
    set({ transfer: { active: false, kind: null, fileName: null, progress: 0, error: null } }),
}));
