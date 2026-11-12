import { act, renderHook, waitFor } from "@testing-library/react";
import { Provider } from "jotai";
import type { ReactNode } from "react";
import type { EPSResultsReader, TimeSeries } from "@epanet-js/simulation";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { convertTo } from "@epanet-js/quantity";
import { setInitialState } from "src/__helpers__/state";
import type { LoggerPressureSample } from "src/lib/logger-stream";
import {
  defaultSimulationSettings,
  type SimulationSettings,
} from "src/simulation/simulation-settings";
import {
  simulationDerivedAtom,
  simulationSettingsDerivedAtom,
  stagingModelDerivedAtom,
} from "src/state/derived-branch-state";
import { projectSettingsAtom } from "src/state/project-settings";
import { useLoggerPressureComparison } from "./use-logger-pressure-comparison";

const IDS = { LOGGER: "logger-1", J1: 1, J2: 2 } as const;
const history: readonly LoggerPressureSample[] = [
  { deviceId: "L1", pressure: 1, timestamp: "2026-11-10T10:00:10Z" },
  { deviceId: "L1", pressure: 2, timestamp: "2026-11-10T10:01:05Z" },
];

describe("logger pressure comparison sources", () => {
  it("discards a late result for the previously connected node", async () => {
    const first = deferred<TimeSeries | null>();
    const second = deferred<TimeSeries | null>();
    const getTimeSeries = vi.fn((assetId: number) =>
      assetId === IDS.J1 ? first.promise : second.promise,
    );
    const { store, wrapper } = setup(readerWith(getTimeSeries));
    const hook = renderHook(
      () => useLoggerPressureComparison(IDS.LOGGER, history, "minute"),
      { wrapper },
    );
    expect(hook.result.current.status).toBe("loading");

    act(() => {
      const settings = store.get(projectSettingsAtom);
      store.set(projectSettingsAtom, {
        ...settings,
        loggers: settings.loggers!.map((logger) => ({
          ...logger,
          connection: {
            assetId: IDS.J2,
            snapPoint: [0, 0] as [number, number],
          },
        })),
      });
    });
    expect(hook.result.current.status).toBe("loading");
    expect(hook.result.current.samples).toEqual([]);

    await act(async () => {
      second.resolve(series(20));
      await second.promise;
    });
    expect(hook.result.current.status).toBe("ready");
    expect(hook.result.current.samples[0].pressure).toBe(20);

    await act(async () => {
      first.resolve(series(10));
      await first.promise;
    });
    expect(hook.result.current.samples[0].pressure).toBe(20);
    expect(getTimeSeries.mock.calls.map(([id]) => id)).toEqual([
      IDS.J1,
      IDS.J2,
    ]);
  });

  it("invalidates changed settings and models while retaining run pressure units", async () => {
    const getTimeSeries = vi.fn(() => Promise.resolve(series(10)));
    const { store, wrapper, settings } = setup(readerWith(getTimeSeries, "m"));
    const hook = renderHook(
      () => useLoggerPressureComparison(IDS.LOGGER, history, "minute"),
      { wrapper },
    );
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    const expectedPressure = convertTo({ value: 10, unit: "mwc" }, "psi");
    expect(hook.result.current.samples[0].pressure).toBeCloseTo(
      expectedPressure,
    );

    act(() => {
      const project = store.get(projectSettingsAtom);
      store.set(projectSettingsAtom, {
        ...project,
        units: { ...project.units, pressure: "bar" },
      });
    });
    expect(hook.result.current.samples[0].pressure).toBeCloseTo(
      expectedPressure,
    );

    act(() =>
      store.set(simulationSettingsDerivedAtom, {
        ...settings,
        version: "changed-settings",
        timing: { ...settings.timing, duration: 120 },
      }),
    );
    expect(hook.result.current.status).toBe("staleSimulation");
    expect(hook.result.current.samples).toEqual([]);

    act(() => store.set(simulationSettingsDerivedAtom, settings));
    expect(hook.result.current.status).toBe("ready");

    act(() =>
      store.set(
        stagingModelDerivedAtom,
        HydraulicModelBuilder.with().aJunction(IDS.J1).build(),
      ),
    );
    expect(hook.result.current.status).toBe("staleSimulation");
    expect(hook.result.current.samples).toEqual([]);
  });

  it("shares cached node results between charts and sidebar remounts", async () => {
    const getTimeSeries = vi.fn(() => Promise.resolve(series(15)));
    const { wrapper } = setup(readerWith(getTimeSeries));
    const first = renderHook(
      () => useLoggerPressureComparison(IDS.LOGGER, history, "minute"),
      { wrapper },
    );
    const expanded = renderHook(
      () => useLoggerPressureComparison(IDS.LOGGER, history, "minute"),
      { wrapper },
    );
    await waitFor(() => {
      expect(first.result.current.status).toBe("ready");
      expect(expanded.result.current.status).toBe("ready");
    });
    expect(getTimeSeries).toHaveBeenCalledOnce();
    first.unmount();
    expanded.unmount();

    const reopened = renderHook(
      () => useLoggerPressureComparison(IDS.LOGGER, history, "hourly"),
      { wrapper },
    );
    await waitFor(() => expect(reopened.result.current.status).toBe("ready"));
    expect(getTimeSeries).toHaveBeenCalledOnce();
    expect(reopened.result.current.samples[0].pressure).toBe(15);
  });

  it("ignores results from a superseded simulation run", async () => {
    const previous = deferred<TimeSeries | null>();
    const next = deferred<TimeSeries | null>();
    const { store, wrapper } = setup(readerWith(() => previous.promise));
    const hook = renderHook(
      () => useLoggerPressureComparison(IDS.LOGGER, history, "minute"),
      { wrapper },
    );

    act(() => {
      const simulation = store.get(simulationDerivedAtom);
      if (simulation.status !== "success")
        throw new Error("Expected a successful simulation fixture");
      store.set(simulationDerivedAtom, {
        ...simulation,
        epsResultsReader: readerWith(() => next.promise),
      });
    });
    await act(async () => {
      next.resolve(series(30));
      await next.promise;
    });
    expect(hook.result.current.samples[0].pressure).toBe(30);

    await act(async () => {
      previous.resolve(series(5));
      await previous.promise;
    });
    expect(hook.result.current.samples[0].pressure).toBe(30);
  });
});

const setup = (reader: EPSResultsReader) => {
  const hydraulicModel = HydraulicModelBuilder.with()
    .aJunction(IDS.J1)
    .aJunction(IDS.J2)
    .build();
  const settings: SimulationSettings = {
    ...defaultSimulationSettings,
    version: "initial-settings",
    timing: {
      duration: 6000,
      reportTimestep: 60,
      hydraulicTimestep: 60,
      patternTimestep: 60,
    },
  };
  const store = setInitialState({
    hydraulicModel,
    simulationSettings: settings,
    simulation: {
      status: "success",
      report: "",
      modelVersion: hydraulicModel.version,
      settingsVersion: settings.version,
      epsResultsReader: reader,
    },
  });
  store.set(projectSettingsAtom, {
    ...store.get(projectSettingsAtom),
    loggers: [
      {
        id: IDS.LOGGER,
        label: "Logger 1",
        coordinates: [0, 0],
        connection: { assetId: IDS.J1, snapPoint: [0, 0] },
      },
    ],
  });
  return {
    store,
    settings,
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  };
};

const readerWith = (
  getTimeSeries: (assetId: number) => Promise<TimeSeries | null>,
  pressureUnits: EPSResultsReader["pressureUnits"] = "psi",
) => ({ getTimeSeries, pressureUnits }) as unknown as EPSResultsReader;

const series = (pressure: number): TimeSeries => ({
  values: new Float32Array([pressure, pressure + 1]),
  intervalsCount: 2,
  intervalSeconds: 60,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};
