import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { setInitialState } from "src/__helpers__/state";
import { SimulationSettingsBuilder } from "src/__helpers__/simulation-settings-builder";
import type { SimulationSettings } from "src/simulation/simulation-settings";
import {
  simulationSettingsDerivedAtom,
  simulationDerivedAtom,
} from "src/state/derived-branch-state";
import { worktreeAtom } from "src/state/scenarios";
import { simulationPlaybackAtom } from "src/state/simulation-playback";
import {
  simulationStepAtom,
  type SimulationFinished,
} from "src/state/simulation";
import {
  simulationPreviewStepAtom,
  simulationStartDateTimeAtom,
} from "src/state/simulation-timeline";
import { useChangeSimulationTimeline } from "./change-simulation-timeline";

const { transact } = vi.hoisted(() => ({
  transact: vi.fn<(settings: SimulationSettings) => boolean>(() => true),
}));

vi.mock("src/hooks/persistence/use-simulation-settings-transaction", () => ({
  useSimulationSettingsTransaction: () => ({ transact }),
}));

describe("simulation timeline changes", () => {
  beforeEach(() => {
    transact.mockReset();
    transact.mockReturnValue(true);
  });

  it("preserves From hours minutes and seconds while stopping playback", () => {
    const store = createTimelineStore();
    const previousResult = store.get(simulationDerivedAtom);
    store.set(simulationPreviewStepAtom, 4);
    store.set(simulationPlaybackAtom, {
      playbackSpeed: "auto",
      playingAtSpeedMs: 500,
    });
    const { result } = renderTimelineCommands(store);
    const from = new Date(2026, 10, 19, 14, 23, 45, 987);

    act(() => {
      expect(result.current.changeStartDateTime(from)).toBe(true);
    });

    expect(store.get(simulationStartDateTimeAtom)).toBe(
      new Date(2026, 10, 19, 14, 23, 45).getTime(),
    );
    expect(store.get(simulationPreviewStepAtom)).toBe(0);
    expect(store.get(simulationPlaybackAtom).playingAtSpeedMs).toBe(0);
    expect(store.get(simulationDerivedAtom)).toBe(previousResult);
  });

  it("rejects an invalid From without changing playback or preview", () => {
    const store = createTimelineStore();
    const timestamp = store.get(simulationStartDateTimeAtom);
    store.set(simulationPreviewStepAtom, 4);
    store.set(simulationPlaybackAtom, {
      playbackSpeed: "auto",
      playingAtSpeedMs: 500,
    });
    const { result } = renderTimelineCommands(store);

    act(() => {
      expect(result.current.changeStartDateTime(new Date(NaN))).toBe(false);
    });

    expect(store.get(simulationStartDateTimeAtom)).toBe(timestamp);
    expect(store.get(simulationPreviewStepAtom)).toBe(4);
    expect(store.get(simulationPlaybackAtom).playingAtSpeedMs).toBe(500);
  });

  it.each([
    [2.6, 3],
    [-1, 0],
    [40, 4],
  ])(
    "clamps preview index %s to %s without selecting a result",
    (requested, expected) => {
      const store = createTimelineStore();
      const actualStep = store.get(simulationStepAtom);
      const { result } = renderTimelineCommands(store);

      act(() => {
        result.current.changePreviewStep(requested, 5);
      });

      expect(store.get(simulationPreviewStepAtom)).toBe(expected);
      expect(store.get(simulationStepAtom)).toBe(actualStep);
    },
  );

  it("rejects an invalid preview range", () => {
    const store = createTimelineStore();
    store.set(simulationPreviewStepAtom, 3);
    const { result } = renderTimelineCommands(store);

    act(() => {
      expect(result.current.changePreviewStep(2, 0)).toBe(false);
      expect(result.current.changePreviewStep(NaN, 5)).toBe(false);
    });

    expect(store.get(simulationPreviewStepAtom)).toBe(3);
  });

  it("keeps the step count when changing timing resolution and preserves old results", () => {
    const store = createTimelineStore();
    const previousResult = store.get(simulationDerivedAtom);
    const settings = store.get(simulationSettingsDerivedAtom);
    store.set(simulationPreviewStepAtom, 3);
    const { result } = renderTimelineCommands(store);

    act(() => {
      expect(result.current.changeTimingPreset("minutes")).toBe(true);
    });

    expect(transact).toHaveBeenCalledWith({
      ...settings,
      version: expect.any(String),
      timing: {
        ...settings.timing,
        duration: 1440,
        hydraulicTimestep: 60,
        reportTimestep: 60,
        patternTimestep: 60,
      },
    });
    expect(transact.mock.calls[0][0].version).not.toBe(settings.version);
    expect(store.get(simulationPreviewStepAtom)).toBe(0);
    expect(store.get(simulationDerivedAtom)).toBe(previousResult);
  });

  it("uses 24 steps for custom timing without an inferred step count", () => {
    const store = createTimelineStore();
    store.set(
      simulationSettingsDerivedAtom,
      SimulationSettingsBuilder.with()
        .timing({
          duration: 1000,
          reportTimestep: 37,
        })
        .build(),
    );
    const { result } = renderTimelineCommands(store);

    act(() => {
      result.current.changeTimingPreset("seconds");
    });

    expect(transact.mock.calls[0][0].timing).toMatchObject({
      duration: 24,
      reportTimestep: 1,
    });
  });

  it("keeps the preview when settings validation rejects the change", () => {
    transact.mockReturnValue(false);
    const store = createTimelineStore();
    store.set(simulationPreviewStepAtom, 3);
    const { result } = renderTimelineCommands(store);

    act(() => {
      expect(result.current.changeTimingPreset("minutes")).toBe(false);
    });

    expect(store.get(simulationPreviewStepAtom)).toBe(3);
  });

  it("keeps timing locked when scenarios exist", () => {
    const store = createTimelineStore();
    store.set(worktreeAtom, (current) => ({
      ...current,
      scenarios: ["scenario"],
    }));
    const { result } = renderTimelineCommands(store);

    act(() => {
      expect(result.current.changeTimingPreset("minutes")).toBe(false);
    });

    expect(transact).not.toHaveBeenCalled();
  });
});

const createTimelineStore = () => {
  const simulation: SimulationFinished = {
    status: "success",
    report: "previous run",
    modelVersion: "1",
    settingsVersion: "1",
    startTimestamp: new Date(2026, 10, 18, 8, 5, 6).getTime(),
    reportingStartTime: 0,
  };
  return setInitialState({
    simulation,
    simulationSettings: SimulationSettingsBuilder.with()
      .timing({ duration: 86400, qualityTimestep: 120 })
      .build(),
  });
};

const renderTimelineCommands = (
  store: ReturnType<typeof createTimelineStore>,
) =>
  renderHook(useChangeSimulationTimeline, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  });
