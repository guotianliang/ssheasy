import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "@/types/sftp";

export const sftpService = {
  listDir: (serverId: string, path: string) =>
    invoke<FileEntry[]>("sftp_list_dir", { serverId, path }),

  home: (serverId: string) => invoke<string>("sftp_home", { serverId }),

  close: (serverId: string) => invoke<void>("sftp_close", { serverId }),
};
