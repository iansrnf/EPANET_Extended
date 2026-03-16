import { create } from "zustand";

export type LivePoint = number | null;

export type LiveLoggerConfig = {
  enabled: boolean;
  wsUrl: string;
  deviceId: string;
  field: string;
  timeMapping: "midnight" | "rolling";
};

const DEFAULT_LIVE_LOGGER: LiveLoggerConfig = {
  enabled: false,
  wsUrl: "wss://logger-api.gscwd.app/stream",
  deviceId: "pi-sim-001",
  field: "pressure",
  timeMapping: "midnight",
};

type Updater<T> = T | ((prev: T) => T);

type LiveSeriesState = {
  liveSeries: LivePoint[];
  liveLogger: LiveLoggerConfig;

  setLiveSeries: (arg: Updater<LivePoint[]>) => void;
  resetLiveSeries: () => void;

  setLiveLogger: (arg: Updater<LiveLoggerConfig>) => void;

  // helper: resize series without wiping
  ensureSeriesLength: (len: number) => void;
};

export const useLiveSeriesStore = create<LiveSeriesState>((set) => ({
  liveSeries: [],
  liveLogger: DEFAULT_LIVE_LOGGER,

  setLiveSeries: (arg) =>
    set((state) => ({
      liveSeries: typeof arg === "function" ? (arg as any)(state.liveSeries) : arg,
    })),

  resetLiveSeries: () => set({ liveSeries: [] }),

  setLiveLogger: (arg) =>
    set((state) => ({
      liveLogger: typeof arg === "function" ? (arg as any)(state.liveLogger) : arg,
    })),

  ensureSeriesLength: (len) =>
    set((state) => {
      const prev = state.liveSeries ?? [];
      if (len <= 0) return { liveSeries: [] };
      if (prev.length === len) return { liveSeries: prev };

      // preserve what we can
      if (prev.length > len) return { liveSeries: prev.slice(0, len) };

      // pad with nulls
      return { liveSeries: [...prev, ...Array(len - prev.length).fill(null)] };
    }),
}));
