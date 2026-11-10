import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import {
  DEFAULT_FLOW_COLORS,
  normalizeFlowColors,
} from "src/map/overlays/flow-animation-colors";

const storedFlowAnimationColorsAtom = atomWithStorage<unknown>(
  "epanet-js:flow-animation-colors",
  DEFAULT_FLOW_COLORS,
);

export const flowAnimationColorsAtom = atom(
  (get) => normalizeFlowColors(get(storedFlowAnimationColorsAtom)),
  (_get, set, colors: readonly string[]) => {
    set(storedFlowAnimationColorsAtom, colors);
  },
);
