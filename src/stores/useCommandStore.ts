import { create } from "zustand";
import type { CommandTemplate, CommandInput } from "@/types/command";
import { commandService } from "@/services/commandService";

export interface RecentCommand {
  id: number;
  serverId: string;
  command: string;
  executedAt: string;
}

interface CommandState {
  commands: CommandTemplate[];
  loading: boolean;
  /** 最近使用（按当前活跃服务器） */
  recentCommands: RecentCommand[];
  recentServerId: string | null;

  fetchCommands: () => Promise<void>;
  addCommand: (input: CommandInput) => Promise<void>;
  updateCommand: (id: string, input: CommandInput) => Promise<void>;
  deleteCommand: (id: string) => Promise<void>;
  fetchRecent: (serverId: string) => Promise<void>;
  /** 执行命令后更新最近使用（本地先插入，避免等待网络） */
  bumpRecent: (serverId: string, command: string) => void;
}

export const useCommandStore = create<CommandState>((set, get) => ({
  commands: [],
  loading: false,
  recentCommands: [],
  recentServerId: null,

  fetchCommands: async () => {
    set({ loading: true });
    try {
      const commands = await commandService.list();
      set({ commands, loading: false });
    } catch (e) {
      set({ loading: false });
      console.error("Failed to fetch commands:", e);
    }
  },

  addCommand: async (input) => {
    const cmd = await commandService.add(input);
    set((s) => ({ commands: [...s.commands, cmd] }));
  },

  updateCommand: async (id, input) => {
    await commandService.update(id, input);
    await get().fetchCommands();
  },

  deleteCommand: async (id) => {
    await commandService.delete(id);
    set((s) => ({ commands: s.commands.filter((c) => c.id !== id) }));
  },

  fetchRecent: async (serverId) => {
    try {
      const recent = await commandService.listRecent(serverId, 20);
      set({ recentCommands: recent, recentServerId: serverId });
    } catch {
      // 静默失败
    }
  },

  bumpRecent: (serverId, command) => {
    // 本地先插到最前，去重
    set((s) => {
      const filtered = s.recentCommands.filter(
        (r) => r.serverId !== serverId || r.command !== command
      );
      const now = new Date().toISOString();
      const entry: RecentCommand = {
        id: -Date.now(),
        serverId,
        command,
        executedAt: now,
      };
      return {
        recentCommands: [entry, ...filtered].slice(0, 20),
        recentServerId: serverId,
      };
    });
  },
}));
