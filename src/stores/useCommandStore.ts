import { create } from "zustand";
import type { CommandTemplate, CommandInput } from "@/types/command";
import { commandService } from "@/services/commandService";

interface CommandState {
  commands: CommandTemplate[];
  loading: boolean;

  fetchCommands: () => Promise<void>;
  addCommand: (input: CommandInput) => Promise<void>;
  updateCommand: (id: string, input: CommandInput) => Promise<void>;
  deleteCommand: (id: string) => Promise<void>;
}

export const useCommandStore = create<CommandState>((set, get) => ({
  commands: [],
  loading: false,

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
}));
