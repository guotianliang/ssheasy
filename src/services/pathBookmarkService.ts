import { invoke } from "@tauri-apps/api/core";
import type { PathBookmark, PathBookmarkInput } from "@/types/pathBookmark";

export const pathBookmarkService = {
  list: (serverId: string) =>
    invoke<PathBookmark[]>("path_bookmark_list", { serverId }),

  add: (input: PathBookmarkInput) =>
    invoke<PathBookmark>("path_bookmark_add", { input }),

  delete: (id: string) => invoke<void>("path_bookmark_delete", { id }),
};
