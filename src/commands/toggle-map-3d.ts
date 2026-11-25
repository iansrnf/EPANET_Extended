import type { Getter, Setter } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";
import { deviceLocationNavigationRevisionAtom } from "src/state/device-location";
import { clearMapHoverAtom } from "src/state/map-hover";
import {
  isMap3DAtom,
  map3DBusyAtom,
  mapPitchRequestAtom,
} from "src/state/map-view";

export const toggleMap3D = (
  get: Getter,
  set: Setter,
  { reducedMotion = false }: { reducedMotion?: boolean } = {},
) => {
  if (get(map3DBusyAtom)) return;

  set(clearMapHoverAtom);
  set(deviceLocationNavigationRevisionAtom, (revision) => revision + 1);
  set(mapPitchRequestAtom, {
    pitch: get(isMap3DAtom) ? 0 : 60,
    duration: reducedMotion ? 0 : 450,
  });
};

export const useToggleMap3D = () =>
  useAtomCallback(useCallback(toggleMap3D, []));
