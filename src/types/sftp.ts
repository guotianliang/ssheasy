export interface FileEntry {
  name: string;
  /** 绝对路径 */
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  /** 格式化后的修改时间，如 "2026-08-01 12:30" */
  modified: string;
}
