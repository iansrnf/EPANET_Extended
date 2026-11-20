import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { setInitialState } from "src/__helpers__/state";
import {
  useTogglePlayback,
  type StopPlaybackSource,
} from "src/commands/toggle-playback";
import type { EPSResultsReader } from "src/simulation";
import { simulationDerivedAtom } from "./derived-branch-state";
import {
  simulationStepAtom,
  simulationStepTransitionDurationAtom,
  type SimulationFinished,
} from "./simulation";
import { simulationPlaybackAtom } from "./simulation-playback";
import { commitSimulationResultAtom, setTimestepAtom } from "./simulation-step";

describe("timestep transition duration", () => {
  it("publishes the playback duration together with its timestep", () => {
    const store = createSimulationStore();
    const observedSteps: [number | null, number][] = [];
    const unsubscribe = store.sub(simulationStepAtom, () => {
      observedSteps.push([
        store.get(simulationStepAtom),
        store.get(simulationStepTransitionDurationAtom),
      ]);
    });

    store.set(setTimestepAtom, 1, 500);

    expect(observedSteps).toEqual([[1, 500]]);
    unsubscribe();
  });

  it("clears playback duration for a manual timestep change", () => {
    const store = createSimulationStore();
    store.set(setTimestepAtom, 1, 500);

    store.set(setTimestepAtom, 2);

    expect(store.get(simulationStepAtom)).toBe(2);
    expect(store.get(simulationStepTransitionDurationAtom)).toBe(0);
  });

  it("clears an unfinished transition when seeking to the same timestep", () => {
    const store = createSimulationStore();
    store.set(setTimestepAtom, 1, 500);

    store.set(setTimestepAtom, 1);

    expect(store.get(simulationStepAtom)).toBe(1);
    expect(store.get(simulationStepTransitionDurationAtom)).toBe(0);
  });

  it("resets the transition when a new result is committed", () => {
    const store = createSimulationStore();
    const nextSimulation = createSimulation();
    store.set(setTimestepAtom, 3, 500);

    store.set(commitSimulationResultAtom, nextSimulation);

    expect(store.get(simulationDerivedAtom)).toBe(nextSimulation);
    expect(store.get(simulationStepAtom)).toBe(0);
    expect(store.get(simulationStepTransitionDurationAtom)).toBe(0);
  });

  it("clears the transition when results are no longer available", () => {
    const store = createSimulationStore();
    store.set(setTimestepAtom, 1, 500);
    store.set(simulationDerivedAtom, { status: "idle" });

    store.set(setTimestepAtom, 2, 500);

    expect(store.get(simulationStepAtom)).toBeNull();
    expect(store.get(simulationStepTransitionDurationAtom)).toBe(0);
  });

  it("clears the transition when the reader has no timesteps", () => {
    const store = createSimulationStore();
    store.set(setTimestepAtom, 1, 500);
    store.set(simulationDerivedAtom, createSimulation(0));

    store.set(setTimestepAtom, 2, 500);

    expect(store.get(simulationStepAtom)).toBeNull();
    expect(store.get(simulationStepTransitionDurationAtom)).toBe(0);
  });
});

describe("stopping a timestep transition", () => {
  it("preserves the final transition when playback stops automatically", () => {
    const store = createSimulationStore();
    store.set(simulationPlaybackAtom, {
      playbackSpeed: "auto",
      playingAtSpeedMs: 500,
    });
    store.set(setTimestepAtom, 4, 500);
    const { result } = renderPlaybackCommand(store);

    act(() => result.current.stopPlayback("auto"));

    expect(store.get(simulationPlaybackAtom).playingAtSpeedMs).toBe(0);
    expect(store.get(simulationStepAtom)).toBe(4);
    expect(store.get(simulationStepTransitionDurationAtom)).toBe(500);
  });

  it.each<StopPlaybackSource>([
    "buttons",
    "shortcut",
    "dropdown",
    "timeline",
    "calendar",
    "quick-graph",
  ])("clears the transition for an explicit %s stop", (source) => {
    const store = createSimulationStore();
    store.set(simulationPlaybackAtom, {
      playbackSpeed: "auto",
      playingAtSpeedMs: 500,
    });
    store.set(setTimestepAtom, 1, 500);
    const { result } = renderPlaybackCommand(store);

    act(() => result.current.stopPlayback(source));

    expect(store.get(simulationPlaybackAtom).playingAtSpeedMs).toBe(0);
    expect(store.get(simulationStepAtom)).toBe(1);
    expect(store.get(simulationStepTransitionDurationAtom)).toBe(0);
  });

  it("cancels the final transition after playback has already stopped", () => {
    const store = createSimulationStore();
    store.set(simulationPlaybackAtom, {
      playbackSpeed: "auto",
      playingAtSpeedMs: 500,
    });
    store.set(setTimestepAtom, 4, 500);
    const { result } = renderPlaybackCommand(store);
    act(() => result.current.stopPlayback("auto"));

    act(() => result.current.stopPlayback("timeline"));

    expect(store.get(simulationPlaybackAtom).playingAtSpeedMs).toBe(0);
    expect(store.get(simulationStepAtom)).toBe(4);
    expect(store.get(simulationStepTransitionDurationAtom)).toBe(0);
  });
});

const createSimulation = (timestepCount = 5): SimulationFinished => ({
  status: "success",
  report: "",
  modelVersion: "1",
  settingsVersion: "1",
  epsResultsReader: { timestepCount } as EPSResultsReader,
});

const createSimulationStore = () =>
  setInitialState({ simulation: createSimulation(), simulationStep: 0 });

const renderPlaybackCommand = (
  store: ReturnType<typeof createSimulationStore>,
) =>
  renderHook(useTogglePlayback, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  });
