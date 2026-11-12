import { atom } from "jotai";
import { USelection } from "src/selection";
import type { Sel } from "src/selection";
import type { SetStateAction } from "jotai";
import { selectedLoggerIdAtom } from "./loggers";

const hydraulicSelectionAtom = atom<Sel>(USelection.none());

export const selectionAtom = atom(
  (get) => get(hydraulicSelectionAtom),
  (_get, set, update: SetStateAction<Sel>) => {
    set(hydraulicSelectionAtom, update);
    set(selectedLoggerIdAtom, null);
  },
);
