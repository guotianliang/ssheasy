export function quoteShellPath(path: string): string {
  const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
  if (path === "~") return '"$HOME"';
  if (path.startsWith("~/")) return '"$HOME"/' + quote(path.slice(2));
  return quote(path);
}
export function isDangerous(command: string): boolean {
  return /\brm\s+[^\n;|]*-[a-z]*[rf]|\b(mkfs|shutdown|reboot|fdisk|parted|killall)\b|\bdd\s|\binit\s+[06]\b|drop\s+database|truncate\s|chmod\s+-r|chown\s+-r|kill\s+-9|>\s*\/dev\/sd|:\(\)\s*\{/i.test(command);
}
