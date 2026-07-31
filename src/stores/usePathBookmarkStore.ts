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

export const usePathBookmarkStore = create<PathBookmarkState>((set) => ({
  bookmarks: [],
  loadedServerId: null,
  loading: false,

  fetchBookmarks: async (serverId) => {
    set({ loading: true });
    try {
      const bookmarks = await pathBookmarkService.list(serverId);
      set({ bookmarks, loadedServerId: serverId, loading: false });
    } catch (e) {
      set({ loading: false });
      console.error("Failed to fetch path bookmarks:", e);
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
