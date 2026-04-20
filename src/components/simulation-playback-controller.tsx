import { useAtomValue } from "jotai";
import type { Getter } from "jotai";
import { atomEffect } from "jotai-effect";
import {
  simulationPlaybackAtom,
  stopPlaybackAtom,
} from "src/state/simulation-playback";
import { simulationDerivedAtom } from "src/state/derived-branch-state";
import { setTimestepAtom } from "src/state/simulation-step";
import { simulationStepAtom } from "src/state/simulation";

export const SimulationPlaybackController = () => {
  useAtomValue(simulationPlaybackEffectAtom);
  useAtomValue(stopPlaybackOnSimulationRunAtom);
  return null;
};

const stopPlaybackOnSimulationRunAtom = atomEffect((get, set) => {
  const { status } = get(simulationDerivedAtom);
  if (status === "running" || status === "idle") {
    set(stopPlaybackAtom);
  }
});

const simulationPlaybackEffectAtom = atomEffect((get, set) => {
  const { isPlaying } = get(simulationPlaybackAtom);
  if (!isPlaying) return;

  const abortController = new AbortController();
  const { signal } = abortController;

  const getStep = () => get.peek(simulationStepAtom) ?? 0;
  const getSpeed = () => get.peek(simulationPlaybackAtom).playbackSpeedMs;
  const getCount = () => getTimestepCount(get.peek);

  async function runLoop() {
    while (!signal.aborted) {
      await sleep(getSpeed());
      if (signal.aborted) break;

      const timestepCount = getCount();
      if (timestepCount <= 1) {
        set(stopPlaybackAtom);
        break;
      }

      const nextStep = getStep() >= timestepCount - 1 ? 0 : getStep() + 1;
      set(setTimestepAtom, nextStep);
    }
  }

  void runLoop();
  return () => abortController.abort();
});

function getTimestepCount(get: Getter): number {
  const simDerived = get(simulationDerivedAtom);
  return (
    ("epsResultsReader" in simDerived
      ? simDerived.epsResultsReader?.timestepCount
      : undefined) ?? 0
  );
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
