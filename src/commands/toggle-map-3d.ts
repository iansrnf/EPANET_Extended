import type { Getter, Setter } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import { deviceLocationNavigationRevisionAtom } from "src/state/device-location";
import { clearMapHoverAtom } from "src/state/map-hover";
import {
  currentMapPitchAtom,
  isMap3DAtom,
  map3DBusyAtom,
  map3DFlatteningAtom,
  mapPitchRequestAtom,
} from "src/state/map-view";

export const toggleMap3D = (
  get: Getter,
  set: Setter,
  { reducedMotion = false }: { reducedMotion?: boolean } = {},
) => {
  if (get(map3DBusyAtom)) return;

  const enabled = !get(isMap3DAtom);
  set(clearMapHoverAtom);
  set(deviceLocationNavigationRevisionAtom, (revision) => revision + 1);
  set(map3DFlatteningAtom, !enabled && get(currentMapPitchAtom) > 0);
  set(isMap3DAtom, enabled);
  set(mapPitchRequestAtom, {
    pitch: enabled ? 60 : 0,
    duration: reducedMotion ? 0 : 450,
  });
};

export const useToggleMap3D = () =>
  useAtomCallback(useCallback(toggleMap3D, []));
