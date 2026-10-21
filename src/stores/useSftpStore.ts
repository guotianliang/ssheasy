import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import type { FileEntry } from "@/types/sftp";
import { sftpService } from "@/services/sftpService";
import { errorMessage } from "@/lib/errors";
export type WorkspaceView = "terminal" | "files" | "logs";
export interface TransferState { active: boolean; kind: "upload" | "download" | "delete" | null; fileName: string | null; progress: number; error: string | null; }
const idle: TransferState = { active: false, kind: null, fileName: null, progress: 0, error: null };
interface SftpState {
  viewMode: WorkspaceView; loadedServerId: string | null; currentPath: string; homePath: string;
  entries: FileEntry[]; loading: boolean; error: string | null;
  previewFile: FileEntry | null; previewContent: string; previewLoading: boolean; previewError: string | null;
  transfer: TransferState;
  setViewMode: (mode: WorkspaceView) => void;
  openPath: (serverId: string, path: string) => Promise<void>;
  goHome: (serverId: string) => Promise<void>; goUp: (serverId: string) => Promise<void>; refresh: (serverId: string) => Promise<void>; reset: () => void;
  previewFile_: (serverId: string, file: FileEntry) => Promise<void>; closePreview: () => void;
  download: (serverId: string, file: FileEntry) => Promise<void>;
  upload: (serverId: string, targetDir?: string) => Promise<void>;
  remove: (serverId: string, file: FileEntry) => Promise<void>;
  rename: (serverId: string, file: FileEntry, newName: string) => Promise<void>;
  mkdir: (serverId: string, name: string) => Promise<void>;
  clearTransferError: () => void;
}
export function parentOf(path: string): string {
  const trimmed = path.replace(/\/+$/, ""); const index = trimmed.lastIndexOf("/");
  return index <= 0 ? "/" : trimmed.slice(0, index);
}
export function joinRemote(dir: string, name: string): string { return dir.replace(/\/+$/, "") + "/" + name; }
export function validFileName(name: string): boolean { return !!name.trim() && name !== "." && name !== ".." && !/[\/\\\0]/.test(name); }
let navigation = 0;
let preview = 0;
export const useSftpStore = create<SftpState>((set, get) => {
  const transfer = async (serverId: string, kind: "upload" | "download" | "delete", choose: () => Promise<{ name: string; run: () => Promise<unknown> } | null>) => {
    if (get().transfer.active) return;
    set({ transfer: { ...idle, active: true, kind } });
    let unlisten: (() => void) | undefined;
    try {
      const selected = await choose();
      if (!selected) { set({ transfer: { ...idle } }); return; }
      set({ transfer: { ...idle, active: true, kind, fileName: selected.name } });
      if (kind !== "delete") unlisten = await listen<{ serverId: string; progress: number }>("sftp:progress", ({ payload }) => {
        if (payload.serverId === serverId) set((s) => ({ transfer: { ...s.transfer, progress: Math.min(100, payload.progress) } }));
      });
      await selected.run();
      set({ transfer: { ...idle, progress: 100 } });
      if (kind !== "download" && get().loadedServerId === serverId) await get().refresh(serverId);
    } catch (e) { set({ transfer: { ...idle, error: errorMessage(e) } }); }
    finally { unlisten?.(); }
  };
  return {
    viewMode: "terminal", loadedServerId: null, currentPath: "", homePath: "", entries: [], loading: false, error: null,
    previewFile: null, previewContent: "", previewLoading: false, previewError: null, transfer: { ...idle },
    setViewMode: (viewMode) => set({ viewMode }),
    openPath: async (serverId, path) => {
      const request = ++navigation;
      const switched = get().loadedServerId !== serverId;
      ++preview;
      set({ loading: true, error: null, loadedServerId: serverId, previewFile: null, ...(switched ? { entries: [], currentPath: "", homePath: "" } : {}) });
      try {
        const target = path || await sftpService.home(serverId);
        const entries = await sftpService.listDir(serverId, target);
        if (request !== navigation) return;
        set({ entries, currentPath: target, loading: false, ...(path ? {} : { homePath: target }) });
      } catch (e) { if (request === navigation) set({ loading: false, error: errorMessage(e) }); }
    },
    goHome: async (serverId) => get().openPath(serverId, get().loadedServerId === serverId ? get().homePath : ""),
    goUp: async (serverId) => { if (get().currentPath) await get().openPath(serverId, parentOf(get().currentPath)); },
    refresh: async (serverId) => get().openPath(serverId, get().loadedServerId === serverId ? get().currentPath : ""),
    reset: () => { ++navigation; ++preview; set({ loadedServerId: null, currentPath: "", homePath: "", entries: [], loading: false, error: null, previewFile: null, previewContent: "", previewError: null, previewLoading: false }); },
    previewFile_: async (serverId, file) => {
      const request = ++preview;
      set({ previewFile: file, previewContent: "", previewLoading: true, previewError: null });
      try { const result = await sftpService.readFile(serverId, file.path); if (request === preview) set({ previewContent: result.content, previewLoading: false }); }
      catch (e) { if (request === preview) set({ previewLoading: false, previewError: errorMessage(e) }); }
    },
    closePreview: () => { ++preview; set({ previewFile: null, previewContent: "", previewError: null, previewLoading: false }); },
    download: async (serverId, file) => transfer(serverId, "download", async () => {
      const dest = await save({ title: "保存文件", defaultPath: file.name });
      return dest ? { name: file.name, run: () => sftpService.download(serverId, file.path, dest) } : null;
    }),
    upload: async (serverId, targetDir) => {
      const dir = targetDir || get().currentPath; if (!dir) return;
      await transfer(serverId, "upload", async () => {
        const selected = await open({ title: "选择要上传的文件", multiple: false, directory: false });
        if (!selected || Array.isArray(selected)) return null;
        const name = selected.split(/[\\/]/).pop() || "upload";
        const path = joinRemote(dir, name);
        return { name, run: async () => {
          try { await sftpService.upload(serverId, path, selected, false); }
          catch (e) {
            if (!errorMessage(e).includes("FILE_EXISTS")) throw e;
            if (await confirm(`远程已存在「${name}」，是否覆盖？`, { title: "覆盖文件", kind: "warning" })) await sftpService.upload(serverId, path, selected, true);
          }
        } };
      });
    },
    remove: async (serverId, file) => transfer(serverId, "delete", async () => ({ name: file.name, run: () => sftpService.remove(serverId, file.path) })),
    rename: async (serverId, file, name) => {
      if (!validFileName(name)) throw new Error("名称不能为空、.、.. 或包含路径分隔符");
      await sftpService.rename(serverId, file.path, joinRemote(parentOf(file.path), name));
      if (get().loadedServerId === serverId) await get().refresh(serverId);
    },
    mkdir: async (serverId, name) => {
      if (!validFileName(name)) throw new Error("目录名称不合法");
      await sftpService.mkdir(serverId, joinRemote(get().currentPath, name)); await get().refresh(serverId);
    },
    clearTransferError: () => { if (!get().transfer.active) set({ transfer: { ...idle } }); },
  };
});
