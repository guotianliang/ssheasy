export interface CommandTemplate {
  id: string;
  category: string;
  cmd: string;
  description?: string;
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CommandInput {
  category: string;
  cmd: string;
  description?: string;
}

/** 从命令模板中解析出的变量 */
export interface TemplateVariable {
  name: string;
  value: string;
}

/** 解析命令模板中的 {{变量}} */
export function parseTemplateVars(cmd: string): string[] {
  const matches = cmd.match(/\{\{(.+?)\}\}/g);
  if (!matches) return [];
  return matches.map((m) => m.replace(/\{\{|\}\}/g, ""));
}

/** 将变量值填入模板 */
export function renderTemplate(cmd: string, vars: Record<string, string>): string {
  return cmd.replace(/\{\{(.+?)\}\}/g, (_, name) => vars[name] || "");
}
