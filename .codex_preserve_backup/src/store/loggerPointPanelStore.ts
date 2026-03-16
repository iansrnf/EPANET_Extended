import { create } from "zustand";

type LoggerPointPanelState = {
  wsUrl: string;
  wsDeviceId: string;
  liveEnabled: boolean;
  combineWithConnectedNode: boolean;
  selectedConnectedJunctions: Record<number, boolean>;
  liveSeries: number[];
  liveSampleCount: number;
  liveData: {
    deviceId?: string;
    status?: string;
    timestamp?: string;
    pressure?: number;
    flow?: number;
    level?: number;
    temperature?: number;
    batteryV?: number;
    externalV?: number;
    gsmPct?: number;
  };
};

type LoggerPointPanelStore = {
  byLoggerId: Record<number, LoggerPointPanelState>;
  getOrCreate: (loggerId: number, defaultDeviceId: string) => LoggerPointPanelState;
  update: (loggerId: number, patch: Partial<LoggerPointPanelState>) => void;
};

const DEFAULT_WS_URL = "wss://logger-api.gscwd.app/stream";
const MAX_LOGGER_POINTS = 300;

const createDefaultState = (defaultDeviceId: string): LoggerPointPanelState => ({
  wsUrl: DEFAULT_WS_URL,
  wsDeviceId: defaultDeviceId,
  liveEnabled: false,
  combineWithConnectedNode: false,
  selectedConnectedJunctions: {},
  liveSeries: [],
  liveSampleCount: 0,
  liveData: {},
});

export const useLoggerPointPanelStore = create<LoggerPointPanelStore>(
  (set, get) => ({
    byLoggerId: {},
    getOrCreate: (loggerId, defaultDeviceId) => {
      const existing = get().byLoggerId[loggerId];
      if (existing) return existing;
      const next = createDefaultState(defaultDeviceId);
      set((state) => ({
        byLoggerId: {
          ...state.byLoggerId,
          [loggerId]: next,
        },
      }));
      return next;
    },
    update: (loggerId, patch) =>
      set((state) => {
        const previous =
          state.byLoggerId[loggerId] ?? createDefaultState("");
        const normalizedPatch: Partial<LoggerPointPanelState> = {
          ...patch,
        };
        if (Array.isArray(patch.liveSeries)) {
          normalizedPatch.liveSeries = patch.liveSeries.slice(-MAX_LOGGER_POINTS);
        }
        return {
          byLoggerId: {
            ...state.byLoggerId,
            [loggerId]: {
              ...previous,
              ...normalizedPatch,
            },
          },
        };
      }),
  }),
);
