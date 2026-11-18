import { atom } from "jotai";
import { hoveredAssetIdAtom } from "./asset-hover";
import { hoveredLoggerIdAtom } from "./loggers";

export const hoveredCustomerPointIdAtom = atom<number | null>(null);
export const hoveredZoneIdAtom = atom<number | null>(null);

export const clearMapHoverAtom = atom(null, (_get, set) => {
  set(hoveredAssetIdAtom, null);
  set(hoveredLoggerIdAtom, null);
  set(hoveredCustomerPointIdAtom, null);
  set(hoveredZoneIdAtom, null);
});
