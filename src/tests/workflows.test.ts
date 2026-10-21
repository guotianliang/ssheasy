import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useServerStore } from "@/stores/useServerStore";
import { useSftpStore } from "@/stores/useSftpStore";
import { useSettingsStore, defaultSettings } from "@/stores/useSettingsStore";
import type { FileEntry } from "@/types/sftp";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn(), confirm: vi.fn(async () => true) }));
const ipc = vi.mocked(invoke);
const file: FileEntry = { name: "a.txt", path: "/tmp/a.txt", isDir: false, isSymlink: false, size: 3, modified: "" };
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
beforeEach(() => {
  vi.resetAllMocks(); ipc.mockResolvedValue(undefined);
  useTerminalStore.setState({ sessions: [], activeSessionId: null, sessionStatuses: {} });
  useServerStore.setState({ servers: [], connectionStatus: {} });
  useSftpStore.getState().reset(); useSftpStore.setState({ transfer: { active: false, kind: null, fileName: null, progress: 0, error: null } });
});
describe("SSH session lifecycle", () => {
  it("registers a tab before SSH output can arrive and deduplicates repeated clicks", async () => {
    const request = deferred<string>(); ipc.mockReturnValueOnce(request.promise);
    const pending = useTerminalStore.getState().connect("server", "Host");
    const tab = useTerminalStore.getState().sessions[0]; expect(tab.status).toBe("connecting");
    expect(await useTerminalStore.getState().connect("server", "Host")).toBe(tab.sessionId);
    expect(ipc).toHaveBeenCalledTimes(1); request.resolve(tab.sessionId); await pending;
    expect(useTerminalStore.getState().sessions[0].status).toBe("connected");
  });
  it("does not turn an already disconnected connection green when invoke resolves", async () => {
    const request = deferred<string>(); ipc.mockReturnValueOnce(request.promise);
    const pending = useTerminalStore.getState().connect("server", "Host");
    const id = useTerminalStore.getState().sessions[0].sessionId;
    useTerminalStore.getState().markDisconnected(id); request.resolve(id); await pending;
    expect(useTerminalStore.getState().sessions[0].status).toBe("disconnected");
  });
  it("retains the original tab and history when reconnect fails", async () => {
    useTerminalStore.setState({ sessions: [{ sessionId: "old", serverId: "server", serverName: "Host", status: "disconnected" }], activeSessionId: "old" });
    ipc.mockRejectedValueOnce("network failed");
    await expect(useTerminalStore.getState().reconnect("old")).rejects.toBe("network failed");
    expect(useTerminalStore.getState().sessions.some((s) => s.sessionId === "old")).toBe(true);
  });
  it("closes the backend session and cleans up local status", async () => {
    useTerminalStore.setState({ sessions: [{ sessionId: "old", serverId: "server", serverName: "Host", status: "connected" }], activeSessionId: "old", sessionStatuses: { old: { user: "user", host: "host", cwd: "/" } } });
    await useTerminalStore.getState().close("old");
    expect(ipc).toHaveBeenCalledWith("terminal_close", { sessionId: "old" });
    expect(useTerminalStore.getState().sessionStatuses).toEqual({}); expect(useTerminalStore.getState().activeSessionId).toBe(null);
  });
  it("keeps another server's file browser when closing an unrelated session", async () => {
    useSftpStore.setState({ loadedServerId: "other", currentPath: "/other", entries: [file] });
    useTerminalStore.setState({ sessions: [{ sessionId: "old", serverId: "server", serverName: "Host", status: "connected" }] });
    await useTerminalStore.getState().close("old");
    expect(useSftpStore.getState().loadedServerId).toBe("other");
  });
  it("clears stale file listings when the owning SSH session disconnects", () => {
    useSftpStore.setState({ loadedServerId: "server", currentPath: "/secret", entries: [file] });
    useTerminalStore.setState({ sessions: [{ sessionId: "old", serverId: "server", serverName: "Host", status: "connected" }] });
    useTerminalStore.getState().markDisconnected("old");
    expect(useSftpStore.getState().entries).toEqual([]);
    expect(useServerStore.getState().connectionStatus.server).toBe("disconnected");
  });
  it("does not let an old disconnect turn a replacement connection offline", () => {
    useServerStore.setState({ connectionStatus: { server: "connected" } });
    useTerminalStore.setState({ sessions: [
      { sessionId: "old", serverId: "server", serverName: "Host", status: "connected" },
      { sessionId: "new", serverId: "server", serverName: "Host", status: "connected" },
    ] });
    useTerminalStore.getState().markDisconnected("old");
    expect(useServerStore.getState().connectionStatus.server).toBe("connected");
  });
});
describe("SFTP asynchronous operations", () => {
  it("ignores directory results from a previously selected server", async () => {
    const old = deferred<FileEntry[]>(); ipc.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ ...file, name: "new" }]);
    const pending = useSftpStore.getState().openPath("old", "/old");
    await useSftpStore.getState().openPath("new", "/new"); old.resolve([file]); await pending;
    expect(useSftpStore.getState().loadedServerId).toBe("new"); expect(useSftpStore.getState().entries[0].name).toBe("new");
  });
  it("does not reopen a preview closed while its request was in flight", async () => {
    const result = deferred<{ content: string }>(); ipc.mockReturnValueOnce(result.promise);
    const pending = useSftpStore.getState().previewFile_("server", file);
    useSftpStore.getState().closePreview(); result.resolve({ content: "private" }); await pending;
    expect(useSftpStore.getState().previewFile).toBe(null); expect(useSftpStore.getState().previewContent).toBe("");
  });
  it("sends a local upload path rather than loading the whole file into JavaScript", async () => {
    vi.mocked(open).mockResolvedValue("/local/a.txt"); useSftpStore.setState({ currentPath: "/remote" });
    await useSftpStore.getState().upload("server");
    expect(ipc).toHaveBeenCalledWith("sftp_upload", { serverId: "server", path: "/remote/a.txt", localPath: "/local/a.txt", overwrite: false });
    expect(useSftpStore.getState().transfer.active).toBe(false);
  });
  it("recovers from a cancelled save dialog without starting a transfer", async () => {
    vi.mocked(save).mockResolvedValue(null); await useSftpStore.getState().download("server", file);
    expect(ipc).not.toHaveBeenCalled(); expect(useSftpStore.getState().transfer.active).toBe(false);
  });
  it("rejects simultaneous transfers and shows backend errors", async () => {
    const dialog = deferred<string | null>(); vi.mocked(save).mockReturnValue(dialog.promise);
    const pending = useSftpStore.getState().download("server", file);
    await useSftpStore.getState().download("server", file); expect(save).toHaveBeenCalledTimes(1);
    ipc.mockRejectedValueOnce("permission denied"); dialog.resolve("/local/a.txt"); await pending;
    expect(useSftpStore.getState().transfer.error).toBe("permission denied"); expect(useSftpStore.getState().transfer.active).toBe(false);
  });
});
describe("settings persistence", () => {
  it("changes appearance only after the backend confirms persistence", async () => {
    useSettingsStore.setState({ settings: { ...defaultSettings, theme: "dark" } }); document.documentElement.dataset.theme = "dark";
    ipc.mockRejectedValueOnce("disk full");
    await expect(useSettingsStore.getState().save({ ...defaultSettings, theme: "light" })).rejects.toBe("disk full");
    expect(useSettingsStore.getState().settings.theme).toBe("dark"); expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
