import { atom } from "jotai";

export type MapPitchRequest = {
  pitch: number;
  duration: number;
};

export const mapPitchRequestAtom = atom<MapPitchRequest | null>(null);
export const currentMapPitchAtom = atom(0);
export const mapPitchTransitioningAtom = atom(false);

export const isMap3DAtom = atom((get) => get(currentMapPitchAtom) > 1);

export const map3DBusyAtom = atom(
  (get) => get(mapPitchRequestAtom) !== null || get(mapPitchTransitioningAtom),
);
