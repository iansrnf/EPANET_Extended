import { atom } from "jotai";

export const MAX_MAP_PITCH = 75;

export type MapPitchRequest = {
  pitch: number;
  duration: number;
};

export const mapPitchRequestAtom = atom<MapPitchRequest | null>(null);
export const currentMapPitchAtom = atom(0);
export const mapPitchTransitioningAtom = atom(false);

export const isMap3DAtom = atom(false);
export const map3DFlatteningAtom = atom(false);

export const mapTerrainEnabledAtom = atom(
  (get) => get(isMap3DAtom) || get(map3DFlatteningAtom),
);

export const map3DBusyAtom = atom(
  (get) =>
    get(mapPitchRequestAtom) !== null ||
    ((get(isMap3DAtom) || get(map3DFlatteningAtom)) &&
      get(mapPitchTransitioningAtom)),
);
