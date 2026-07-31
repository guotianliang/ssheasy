import { invoke } from "@tauri-apps/api/core";
import type { CommandTemplate, CommandInput } from "@/types/command";

export const commandService = {
  list: () => invoke<CommandTemplate[]>("command_list"),

  add: (input: CommandInput) =>
    invoke<CommandTemplate>("command_add", { input }),

  update: (id: string, input: CommandInput) =>
    invoke<void>("command_update", { id, input }),

  delete: (id: string) => invoke<void>("command_delete", { id }),
};
