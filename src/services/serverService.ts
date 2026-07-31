import { invoke } from "@tauri-apps/api/core";
import type { Server, ServerInput, TestResult } from "@/types/server";

export const serverService = {
  list: () => invoke<Server[]>("server_list"),

  add: (input: ServerInput, password?: string, keyPassphrase?: string) =>
    invoke<Server>("server_add", { input, password, keyPassphrase }),

  update: (id: string, input: ServerInput, password?: string, keyPassphrase?: string) =>
    invoke<void>("server_update", { id, input, password, keyPassphrase }),

  delete: (id: string) => invoke<void>("server_delete", { id }),

  test: (input: ServerInput, password?: string, keyPassphrase?: string) =>
    invoke<TestResult>("server_test", { input, password, keyPassphrase }),
};
