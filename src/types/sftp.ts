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

export interface FileContent {
  content: string;
  size: number;
  truncated: boolean;
}

/** 下载结果（base64 内容） */
export interface FileDownload {
  name: string;
  contentBase64: string;
  size: number;
}

/** 可预览的文本文件后缀 */
const PREVIEWABLE_EXTS = [
  "log", "txt", "conf", "cfg", "json", "yaml", "yml", "ini", "env",
  "md", "csv", "tsv", "xml", "sql", "sh", "py", "js", "ts", "go",
  "rs", "java", "c", "cpp", "h", "properties", "toml",
];

export function isPreviewable(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return PREVIEWABLE_EXTS.includes(ext);
}
