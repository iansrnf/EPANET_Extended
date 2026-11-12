import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { loadLoggerHistory as fetchLoggerHistory } from "src/lib/logger-history";
import {
  createInitialLoggerStreamState,
  type LoggerPressureSample,
} from "src/lib/logger-stream";
import {
  loggerHistoryViewsAtom,
  selectedLoggerHistoryViewAtom,
} from "src/state/logger-history";
import {
  loggerReadingsAtom,
  loggerStreamsAtom,
  resetLoggerStreamsAtom,
} from "src/state/logger-stream";
import { selectedLoggerIdAtom } from "src/state/loggers";
import { projectSettingsAtom } from "src/state/project-settings";
import {
  clearLoggerHistoryRequests,
  retainLoggerHistoryViews,
  useLoggerHistoryActions,
} from "./logger-history";
import { useLoggerStreamActions } from "./logger-stream";

vi.mock("src/lib/logger-history", async () => {
  const actual = await vi.importActual<typeof import("src/lib/logger-history")>(
    "src/lib/logger-history",
  );
  return { ...actual, loadLoggerHistory: vi.fn() };
});

const IDS = { LOGGER1: "logger-1", LOGGER2: "logger-2" } as const;
const samples: readonly LoggerPressureSample[] = [
  {
    deviceId: "L2",
    timestamp: "2026-03-11T06:00:03Z",
    pressure: -0.03768,
  },
];

const setup = () => {
  const store = createStore();
  store.set(projectSettingsAtom, {
    ...store.get(projectSettingsAtom),
    loggers: [IDS.LOGGER1, IDS.LOGGER2].map((id) => ({
      id,
      label: id,
      coordinates: [0, 0] as [number, number],
      connection: null,
    })),
  });
  store.set(selectedLoggerIdAtom, IDS.LOGGER1);
  store.set(
    loggerStreamsAtom,
    new Map([[IDS.LOGGER1, createInitialLoggerStreamState("L2")]]),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const actions = renderHook(
    () => ({
      history: useLoggerHistoryActions(),
      stream: useLoggerStreamActions(),
    }),
    { wrapper },
  );
  act(() => {
    actions.result.current.history.setLoggerHistoryMode(IDS.LOGGER1, "history");
    actions.result.current.history.setLoggerHistoryRange(
      IDS.LOGGER1,
      "from",
      "2026-03-11T14:00:00",
    );
    actions.result.current.history.setLoggerHistoryRange(
      IDS.LOGGER1,
      "to",
      "2026-03-11T15:00:00",
    );
  });
  return { store, actions };
};

const deferred = () => {
  let resolve!: (value: readonly LoggerPressureSample[]) => void;
  const promise = new Promise<readonly LoggerPressureSample[]>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
};

describe("logger HTTP history actions", () => {
  beforeEach(() => {
    vi.mocked(fetchLoggerHistory).mockReset();
  });

  it("converts UTC+8 form dates to UTC requests without changing source timestamps", async () => {
    const sourceSamples = [
      {
        deviceId: "L2",
        timestamp: "2026-03-10T16:31:03Z",
        pressure: 0.5,
      },
    ];
    vi.mocked(fetchLoggerHistory).mockResolvedValue(sourceSamples);
    const { store, actions } = setup();
    act(() => {
      actions.result.current.history.setLoggerHistoryRange(
        IDS.LOGGER1,
        "from",
        "2026-03-11T00:30:00",
      );
      actions.result.current.history.setLoggerHistoryRange(
        IDS.LOGGER1,
        "to",
        "2026-03-11T01:30:00",
      );
      actions.result.current.history.setLoggerHistoryInterval(
        IDS.LOGGER1,
        "minute",
      );
    });
    await act(async () =>
      actions.result.current.history.loadLoggerHistory(IDS.LOGGER1),
    );

    const expectedRange = {
      from: "2026-03-10T16:30:00.000Z",
      to: "2026-03-10T17:30:00.000Z",
    };
    expect(fetchLoggerHistory).toHaveBeenCalledWith(
      "L2",
      expectedRange,
      expect.any(AbortSignal),
      null,
      "minute",
    );
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)).toMatchObject({
      from: "2026-03-11T00:30:00",
      to: "2026-03-11T01:30:00",
      loadedRange: expectedRange,
      samples: sourceSamples,
    });
  });

  it("retains historical results independently of live values and sidebar selection", async () => {
    const response = deferred();
    vi.mocked(fetchLoggerHistory).mockReturnValue(response.promise);
    const { store, actions } = setup();
    let pending!: Promise<void>;
    act(() => {
      pending = actions.result.current.history.loadLoggerHistory(IDS.LOGGER1);
    });
    expect(fetchLoggerHistory).toHaveBeenCalledWith(
      "L2",
      { from: "2026-03-11T06:00:00.000Z", to: "2026-03-11T07:00:00.000Z" },
      expect.any(AbortSignal),
      null,
      "minute",
    );
    actions.unmount();
    const liveReading = {
      deviceId: "L2",
      type: "pressure",
      timestamp: "2026-11-11T10:28:22",
      pressure: 0,
    };
    store.set(loggerReadingsAtom, new Map([[IDS.LOGGER1, liveReading]]));
    store.set(selectedLoggerIdAtom, IDS.LOGGER2);
    await act(async () => {
      response.resolve(samples);
      await pending;
    });

    const loaded = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    expect(loaded).toMatchObject({
      mode: "history",
      status: "loaded",
      loadedDeviceId: "L2",
      samples,
    });
    expect(store.get(loggerReadingsAtom).get(IDS.LOGGER1)).toBe(liveReading);
    store.set(selectedLoggerIdAtom, IDS.LOGGER1);
    expect(store.get(selectedLoggerHistoryViewAtom)).toBe(loaded);
    clearLoggerHistoryRequests(store);
  });

  it("cancels replaced requests and keeps the last success when a reload fails", async () => {
    const first = deferred();
    vi.mocked(fetchLoggerHistory).mockReturnValue(first.promise);
    const { store, actions } = setup();
    let firstRequest!: Promise<void>;
    act(() => {
      firstRequest = actions.result.current.history.loadLoggerHistory(
        IDS.LOGGER1,
      );
    });
    const firstSignal = vi.mocked(fetchLoggerHistory).mock.calls[0][2];
    act(() =>
      actions.result.current.history.setLoggerHistoryRange(
        IDS.LOGGER1,
        "to",
        "2026-03-11T16:00:00",
      ),
    );
    expect(firstSignal.aborted).toBe(true);
    vi.mocked(fetchLoggerHistory).mockResolvedValue(samples);
    await act(async () =>
      actions.result.current.history.loadLoggerHistory(IDS.LOGGER1),
    );
    const loaded = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    await act(async () => {
      first.resolve([]);
      await firstRequest;
    });
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)).toBe(loaded);

    vi.mocked(fetchLoggerHistory).mockRejectedValue(
      new Error("Network unavailable"),
    );
    await actions.result.current.history.loadLoggerHistory(IDS.LOGGER1);
    const failed = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    expect(failed.status).toBe("error");
    expect(failed.error).toBe("requestFailed");
    expect(failed.samples).toBe(samples);
    expect(failed.loadedRange).toBe(loaded.loadedRange);
    clearLoggerHistoryRequests(store);
  });

  it("changes displayed counts immediately from the full hourly cache", async () => {
    const allSamples = Array.from({ length: 240 }, (_, index) => ({
      deviceId: "L2",
      timestamp: new Date(Date.UTC(2026, 0, 1) + index * 3600000).toISOString(),
      pressure: index - 100,
    }));
    vi.mocked(fetchLoggerHistory).mockResolvedValue(allSamples);
    const { store, actions } = setup();
    const history = actions.result.current.history;
    history.setLoggerHistoryRange(IDS.LOGGER1, "from", "2026-01-01T08:00:00");
    history.setLoggerHistoryRange(IDS.LOGGER1, "to", "2026-01-15T08:00:00");
    await history.loadLoggerHistory(IDS.LOGGER1);

    const loaded = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    expect(loaded.samples).toBe(allSamples);
    expect(loaded.allSamples).toBe(allSamples);
    for (const preset of ["10", "24", "100", "150"] as const) {
      history.setLoggerHistorySampling(IDS.LOGGER1, "sampleLimit", preset);
      const displayed = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
      expect(displayed.samples).toEqual(allSamples.slice(-Number(preset)));
      expect(displayed.loadedSampleLimit).toBe(Number(preset));
      expect(displayed.loadedRange).toBe(loaded.loadedRange);
    }

    history.setLoggerHistorySampling(IDS.LOGGER1, "customSampleLimit", "175");
    history.setLoggerHistorySampling(IDS.LOGGER1, "sampleLimit", "custom");
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)?.samples).toEqual(
      allSamples.slice(-175),
    );
    history.setLoggerHistorySampling(IDS.LOGGER1, "sampleLimit", "all");
    const restored = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    expect(restored.samples).toBe(allSamples);
    expect(restored.loadedSampleLimit).toBeNull();
    expect(fetchLoggerHistory).toHaveBeenCalledOnce();
  });

  it("switches intervals from the full minute cache before applying count limits", async () => {
    const minuteSamples = [
      { deviceId: "L2", timestamp: "2026-03-11T01:00:10Z", pressure: -0.1 },
      { deviceId: "L2", timestamp: "2026-03-11T01:01:05Z", pressure: 0 },
      { deviceId: "L2", timestamp: "2026-03-11T01:59:59Z", pressure: 0.59 },
      { deviceId: "L2", timestamp: "2026-03-11T02:00:10Z", pressure: 0.2 },
      { deviceId: "L2", timestamp: "2026-03-11T02:01:00Z", pressure: 0.21 },
    ];
    vi.mocked(fetchLoggerHistory).mockResolvedValue(minuteSamples);
    const { store, actions } = setup();
    const history = actions.result.current.history;
    history.setLoggerHistoryRange(IDS.LOGGER1, "from", "2026-03-11T09:00:00");
    history.setLoggerHistoryRange(IDS.LOGGER1, "to", "2026-03-11T10:01:00");
    await history.loadLoggerHistory(IDS.LOGGER1);
    const loaded = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    expect(loaded.samples).toEqual([minuteSamples[0], minuteSamples[3]]);
    expect(loaded.minuteSamples).toBe(minuteSamples);
    expect(loaded.loadedInterval).toBe("hourly");

    history.setLoggerHistoryInterval(IDS.LOGGER1, "minute");
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)?.samples).toBe(
      minuteSamples,
    );
    history.setLoggerHistorySampling(IDS.LOGGER1, "customSampleLimit", "2");
    history.setLoggerHistorySampling(IDS.LOGGER1, "sampleLimit", "custom");
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)?.samples).toEqual(
      minuteSamples.slice(-2),
    );
    history.setLoggerHistoryInterval(IDS.LOGGER1, "hourly");
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)?.samples).toEqual(
      [minuteSamples[0], minuteSamples[3]],
    );

    history.setLoggerHistoryRange(IDS.LOGGER1, "from", "2026-03-11T11:00:00");
    history.setLoggerHistoryRange(IDS.LOGGER1, "to", "2026-03-11T12:00:00");
    history.setLoggerHistorySampling(IDS.LOGGER1, "sampleLimit", "all");
    history.setLoggerHistoryInterval(IDS.LOGGER1, "minute");
    const displayed = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    expect(displayed.samples).toBe(minuteSamples);
    expect(displayed.loadedRange).toBe(loaded.loadedRange);
    expect(displayed.loadedInterval).toBe("minute");
    expect(fetchLoggerHistory).toHaveBeenCalledOnce();
  });

  it("uses the latest interval choice when a request finishes", async () => {
    const response = deferred();
    const minuteSamples = [
      { deviceId: "L2", timestamp: "2026-03-11T06:00:10Z", pressure: -0.1 },
      { deviceId: "L2", timestamp: "2026-03-11T06:01:20Z", pressure: 0 },
    ];
    vi.mocked(fetchLoggerHistory).mockReturnValue(response.promise);
    const { store, actions } = setup();
    const history = actions.result.current.history;
    const pending = history.loadLoggerHistory(IDS.LOGGER1);
    history.setLoggerHistoryInterval(IDS.LOGGER1, "minute");
    response.resolve(minuteSamples);
    await pending;
    const loaded = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    expect(loaded.samples).toBe(minuteSamples);
    expect(loaded.loadedInterval).toBe("minute");
    expect(fetchLoggerHistory).toHaveBeenCalledOnce();
  });

  it("retains the last valid plot while a Custom count is invalid", async () => {
    vi.mocked(fetchLoggerHistory).mockResolvedValue(samples);
    const { store, actions } = setup();
    const history = actions.result.current.history;
    await history.loadLoggerHistory(IDS.LOGGER1);
    const loaded = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    history.setLoggerHistorySampling(IDS.LOGGER1, "sampleLimit", "custom");
    history.setLoggerHistorySampling(IDS.LOGGER1, "customSampleLimit", "0");
    const invalid = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    expect(invalid.error).toBe("invalidSampleLimit");
    expect(invalid.samples).toBe(loaded.samples);
    expect(invalid.loadedSampleLimit).toBe(250);
    await history.loadLoggerHistory(IDS.LOGGER1);
    expect(fetchLoggerHistory).toHaveBeenCalledOnce();

    history.setLoggerHistorySampling(IDS.LOGGER1, "customSampleLimit", "500");
    const valid = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    expect(valid.error).toBeNull();
    expect(valid.loadedSampleLimit).toBe(500);
    expect(valid.samples).toBe(samples);
  });

  it("applies the latest sampling choice when an all-points request finishes", async () => {
    const response = deferred();
    const allSamples = Array.from({ length: 30 }, (_, index) => ({
      deviceId: "L2",
      timestamp: new Date(
        Date.UTC(2026, 2, 11) + index * 3600000,
      ).toISOString(),
      pressure: index,
    }));
    vi.mocked(fetchLoggerHistory).mockReturnValue(response.promise);
    const { store, actions } = setup();
    const history = actions.result.current.history;
    history.setLoggerHistoryRange(IDS.LOGGER1, "from", "2026-03-11T08:00:00");
    history.setLoggerHistoryRange(IDS.LOGGER1, "to", "2026-03-12T14:00:00");
    const pending = history.loadLoggerHistory(IDS.LOGGER1);
    history.setLoggerHistorySampling(IDS.LOGGER1, "sampleLimit", "10");
    response.resolve(allSamples);
    await pending;
    const loaded = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    expect(loaded.allSamples).toBe(allSamples);
    expect(loaded.samples).toEqual(allSamples.slice(-10));
    expect(loaded.loadedSampleLimit).toBe(10);
    expect(vi.mocked(fetchLoggerHistory).mock.calls[0][2].aborted).toBe(false);
  });

  it("keeps fetched data available if a Custom draft becomes invalid while loading", async () => {
    const response = deferred();
    vi.mocked(fetchLoggerHistory).mockReturnValue(response.promise);
    const { store, actions } = setup();
    const history = actions.result.current.history;
    history.setLoggerHistorySampling(IDS.LOGGER1, "sampleLimit", "10");
    const pending = history.loadLoggerHistory(IDS.LOGGER1);
    history.setLoggerHistorySampling(IDS.LOGGER1, "sampleLimit", "custom");
    history.setLoggerHistorySampling(IDS.LOGGER1, "customSampleLimit", "0");
    response.resolve(samples);
    await pending;
    const loaded = store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)!;
    expect(loaded.status).toBe("loaded");
    expect(loaded.error).toBe("invalidSampleLimit");
    expect(loaded.allSamples).toBe(samples);
    expect(loaded.samples).toBe(samples);
    expect(loaded.loadedSampleLimit).toBe(250);
    history.setLoggerHistorySampling(IDS.LOGGER1, "customSampleLimit", "20");
    expect(
      store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)?.error,
    ).toBeNull();
    expect(fetchLoggerHistory).toHaveBeenCalledOnce();
  });

  it("keeps a default device binding when an earlier Logger is deleted", async () => {
    const response = deferred();
    vi.mocked(fetchLoggerHistory).mockReturnValue(response.promise);
    const { store, actions } = setup();
    store.set(loggerStreamsAtom, new Map());
    let pending!: Promise<void>;
    act(() => {
      actions.result.current.history.setLoggerHistoryRange(
        IDS.LOGGER2,
        "from",
        "2026-03-11T14:00:00",
      );
      actions.result.current.history.setLoggerHistoryRange(
        IDS.LOGGER2,
        "to",
        "2026-03-11T15:00:00",
      );
      pending = actions.result.current.history.loadLoggerHistory(IDS.LOGGER2);
      const settings = store.get(projectSettingsAtom);
      store.set(projectSettingsAtom, {
        ...settings,
        loggers: settings.loggers!.filter(
          (logger) => logger.id === IDS.LOGGER2,
        ),
      });
      retainLoggerHistoryViews(store, new Set([IDS.LOGGER2]));
    });
    expect(store.get(loggerStreamsAtom).get(IDS.LOGGER2)?.deviceId).toBe("L2");
    await act(async () => {
      response.resolve(samples);
      await pending;
    });
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER2)).toMatchObject({
      status: "loaded",
      loadedDeviceId: "L2",
      samples,
    });
  });

  it("rejects invalid ranges before HTTP and invalidates a request when the device changes", async () => {
    const response = deferred();
    vi.mocked(fetchLoggerHistory).mockReturnValue(response.promise);
    const { store, actions } = setup();
    act(() =>
      actions.result.current.history.setLoggerHistoryRange(
        IDS.LOGGER1,
        "from",
        "2026-03-11T17:00:00",
      ),
    );
    await act(async () =>
      actions.result.current.history.loadLoggerHistory(IDS.LOGGER1),
    );
    expect(fetchLoggerHistory).not.toHaveBeenCalled();
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)?.error).toBe(
      "invalidRange",
    );
    act(() =>
      actions.result.current.history.setLoggerHistoryRange(
        IDS.LOGGER1,
        "from",
        "2026-03-11T14:00:00",
      ),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = actions.result.current.history.loadLoggerHistory(IDS.LOGGER1);
      actions.result.current.stream.setLoggerDeviceId(IDS.LOGGER1, "L3");
    });
    expect(vi.mocked(fetchLoggerHistory).mock.calls[0][2].aborted).toBe(true);
    expect(store.get(loggerStreamsAtom).get(IDS.LOGGER1)?.deviceId).toBe("L3");
    await act(async () => {
      response.resolve(samples);
      await pending;
    });
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)?.samples).toEqual(
      [],
    );
    expect(store.get(loggerHistoryViewsAtom).get(IDS.LOGGER1)?.status).toBe(
      "idle",
    );
  });

  it.each(["delete", "reset"])(
    "prevents a late response from restoring history after %s",
    async (operation) => {
      const response = deferred();
      vi.mocked(fetchLoggerHistory).mockReturnValue(response.promise);
      const { store, actions } = setup();
      let pending!: Promise<void>;
      act(() => {
        pending = actions.result.current.history.loadLoggerHistory(IDS.LOGGER1);
        if (operation === "delete") {
          store.set(projectSettingsAtom, {
            ...store.get(projectSettingsAtom),
            loggers: [],
          });
          retainLoggerHistoryViews(store, new Set());
        } else {
          store.set(resetLoggerStreamsAtom);
          clearLoggerHistoryRequests(store);
        }
      });
      expect(vi.mocked(fetchLoggerHistory).mock.calls[0][2].aborted).toBe(true);
      await act(async () => {
        response.resolve(samples);
        await pending;
      });
      expect(store.get(loggerHistoryViewsAtom).size).toBe(0);
    },
  );
});
