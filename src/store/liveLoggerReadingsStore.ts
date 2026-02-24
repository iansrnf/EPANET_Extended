import { create } from "zustand";

export type LiveLoggerReading = {
  connected: boolean;
  pressurePsi: number | null;
  timestamp?: string;
};

type LiveLoggerReadingsState = {
  readingsByDeviceId: Record<string, LiveLoggerReading>;
  pointsByDeviceId: Record<string, number[]>;
  revision: number;
  upsertReading: (
    deviceId: string,
    reading: Partial<Omit<LiveLoggerReading, "connected">>,
  ) => void;
  setConnection: (deviceId: string, connected: boolean) => void;
  clearDevice: (deviceId: string) => void;
};

const normalizeDeviceId = (deviceId: string) => deviceId.trim();
const MAX_POINTS_PER_DEVICE = 300;
const roundPsi = (value: number | null | undefined): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
};

export const useLiveLoggerReadingsStore = create<LiveLoggerReadingsState>(
  (set) => ({
    readingsByDeviceId: {},
    pointsByDeviceId: {},
    revision: 0,
    upsertReading: (deviceId, reading) =>
      set((state) => {
        const normalizedDeviceId = normalizeDeviceId(deviceId);
        if (!normalizedDeviceId) return state;

        const previous = state.readingsByDeviceId[normalizedDeviceId] ?? {
          connected: false,
          pressurePsi: null,
        };
        const nextPressurePsi =
          "pressurePsi" in reading
            ? roundPsi(reading.pressurePsi)
            : previous.pressurePsi;
        const nextTimestamp =
          "timestamp" in reading ? reading.timestamp : previous.timestamp;

        const hasVisualChange =
          previous.pressurePsi !== nextPressurePsi ||
          previous.timestamp !== nextTimestamp;
        if (!hasVisualChange) return state;

        const previousPoints = state.pointsByDeviceId[normalizedDeviceId] ?? [];
        const nextPoints =
          typeof nextPressurePsi === "number"
            ? [...previousPoints, nextPressurePsi].slice(-MAX_POINTS_PER_DEVICE)
            : previousPoints;

        return {
          readingsByDeviceId: {
            ...state.readingsByDeviceId,
            [normalizedDeviceId]: {
              ...previous,
              pressurePsi: nextPressurePsi,
              timestamp: nextTimestamp,
            },
          },
          pointsByDeviceId: {
            ...state.pointsByDeviceId,
            [normalizedDeviceId]: nextPoints,
          },
          revision: state.revision + 1,
        };
      }),
    setConnection: (deviceId, connected) =>
      set((state) => {
        const normalizedDeviceId = normalizeDeviceId(deviceId);
        if (!normalizedDeviceId) return state;

        const previous = state.readingsByDeviceId[normalizedDeviceId] ?? {
          connected: false,
          pressurePsi: null,
        };
        if (previous.connected === connected) return state;

        return {
          readingsByDeviceId: {
            ...state.readingsByDeviceId,
            [normalizedDeviceId]: {
              ...previous,
              connected,
            },
          },
          revision: state.revision + 1,
        };
      }),
    clearDevice: (deviceId) =>
      set((state) => {
        const normalizedDeviceId = normalizeDeviceId(deviceId);
        if (!normalizedDeviceId) return state;

        if (!(normalizedDeviceId in state.readingsByDeviceId)) return state;

        const { [normalizedDeviceId]: _removed, ...rest } =
          state.readingsByDeviceId;
        const { [normalizedDeviceId]: _removedPoints, ...restPoints } =
          state.pointsByDeviceId;

        return {
          readingsByDeviceId: rest,
          pointsByDeviceId: restPoints,
          revision: state.revision + 1,
        };
      }),
  }),
);
