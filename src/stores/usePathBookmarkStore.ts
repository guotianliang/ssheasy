import { reportError } from "@/lib/errors";
import { create } from "zustand";
import type { PathBookmark, PathBookmarkInput } from "@/types/pathBookmark";
import { pathBookmarkService } from "@/services/pathBookmarkService";

interface PathBookmarkState {
  /** 当前展示的书签（按当前激活会话对应的服务器） */
  bookmarks: PathBookmark[];
  /** 当前书签所属的 serverId，用于判断是否需要重新拉取 */
  loadedServerId: string | null;
  loading: boolean;

  fetchBookmarks: (serverId: string) => Promise<void>;
  addBookmark: (input: PathBookmarkInput) => Promise<void>;
  deleteBookmark: (id: string) => Promise<void>;
  reset: () => void;
}

export const usePathBookmarkStore = create<PathBookmarkState>((set, get) => ({
  bookmarks: [],
  loadedServerId: null,
  loading: false,

  fetchBookmarks: async (serverId) => {
    set({ loading: true, loadedServerId: serverId, bookmarks: [] });
    try {
      const bookmarks = await pathBookmarkService.list(serverId);
      if (get().loadedServerId === serverId) set({ bookmarks, loading: false });
    } catch (e) {
      set({ loading: false });
      reportError(e);
    }
  },

  addBookmark: async (input) => {
    const bm = await pathBookmarkService.add(input);
    set((s) => ({ bookmarks: [bm, ...s.bookmarks] }));
  },

  deleteBookmark: async (id) => {
    await pathBookmarkService.delete(id);
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
  },

  reset: () => set({ bookmarks: [], loadedServerId: null }),
}));
