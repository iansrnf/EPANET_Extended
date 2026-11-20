import { atom } from "jotai";
import { atomWithLazy } from "jotai/utils";

export const simulationStartDateTimeAtom = atomWithLazy(
  () => Math.floor(Date.now() / 1000) * 1000,
);

export const simulationPreviewStepAtom = atom(0);
