import { invoke } from "@tauri-apps/api/core";
import type { CommandTemplate, CommandInput } from "@/types/command";
import type { RecentCommand } from "@/stores/useCommandStore";

export const commandService = {
  list: () => invoke<CommandTemplate[]>("command_list"),

  add: (input: CommandInput) =>
    invoke<CommandTemplate>("command_add", { input }),

  update: (id: string, input: CommandInput) =>
    invoke<void>("command_update", { id, input }),

  delete: (id: string) => invoke<void>("command_delete", { id }),

  listRecent: (serverId: string, limit?: number) =>
    invoke<RecentCommand[]>("list_recent_commands", {
      serverId,
      limit: limit ?? null,
    }),
};
