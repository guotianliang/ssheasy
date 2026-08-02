import { invoke } from "@tauri-apps/api/core";
import type { FileEntry, FileContent, FileDownload } from "@/types/sftp";

export const sftpService = {
  listDir: (serverId: string, path: string) =>
    invoke<FileEntry[]>("sftp_list_dir", { serverId, path }),

  home: (serverId: string) => invoke<string>("sftp_home", { serverId }),

  close: (serverId: string) => invoke<void>("sftp_close", { serverId }),

  readFile: (serverId: string, path: string) =>
    invoke<FileContent>("sftp_read_file", { serverId, path }),

  download: (serverId: string, path: string, destPath: string) =>
    invoke<FileDownload>("sftp_download", { serverId, path, destPath }),

  upload: (serverId: string, path: string, contentBase64: string, overwrite: boolean) =>
    invoke<void>("sftp_upload", { serverId, path, contentBase64, overwrite }),

  remove: (serverId: string, path: string) =>
    invoke<void>("sftp_delete", { serverId, path }),

  rename: (serverId: string, from: string, to: string) =>
    invoke<void>("sftp_rename", { serverId, from, to }),
};
