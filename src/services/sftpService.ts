import { invoke } from "@tauri-apps/api/core";
import type { FileEntry, FileContent } from "@/types/sftp";

export const sftpService = {
  listDir: (serverId: string, path: string) =>
    invoke<FileEntry[]>("sftp_list_dir", { serverId, path }),

  home: (serverId: string) => invoke<string>("sftp_home", { serverId }),

  close: (serverId: string) => invoke<void>("sftp_close", { serverId }),

  readFile: (serverId: string, path: string) =>
    invoke<FileContent>("sftp_read_file", { serverId, path }),
};
