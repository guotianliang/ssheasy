import { create } from "zustand";
import type { Server, ServerInput, ConnectionStatus } from "@/types/server";
import { serverService } from "@/services/serverService";

interface ServerState {
  servers: Server[];
  activeServerId: string | null;
  connectionStatus: Record<string, ConnectionStatus>;
  loading: boolean;

  fetchServers: () => Promise<void>;
  addServer: (input: ServerInput, password?: string, keyPassphrase?: string) => Promise<Server>;
  updateServer: (id: string, input: ServerInput, password?: string, keyPassphrase?: string) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  setActiveServer: (id: string | null) => void;
  setConnectionStatus: (serverId: string, status: ConnectionStatus) => void;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  activeServerId: null,
  connectionStatus: {},
  loading: false,

  fetchServers: async () => {
    set({ loading: true });
    try {
      const servers = await serverService.list();
      set({ servers, loading: false });
    } catch (e) {
      set({ loading: false });
      console.error("Failed to fetch servers:", e);
    }
  },

  addServer: async (input, password, keyPassphrase) => {
    const server = await serverService.add(input, password, keyPassphrase);
    set((s) => ({ servers: [...s.servers, server] }));
    return server;
  },

  updateServer: async (id, input, password, keyPassphrase) => {
    await serverService.update(id, input, password, keyPassphrase);
    await get().fetchServers();
  },

  deleteServer: async (id) => {
    await serverService.delete(id);
    set((s) => ({
      servers: s.servers.filter((srv) => srv.id !== id),
      activeServerId: s.activeServerId === id ? null : s.activeServerId,
    }));
  },

  setActiveServer: (id) => set({ activeServerId: id }),

  setConnectionStatus: (serverId, status) =>
    set((s) => ({
      connectionStatus: { ...s.connectionStatus, [serverId]: status },
    })),
}));
