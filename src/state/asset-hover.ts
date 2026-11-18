import { atom } from "jotai";
import type { AssetId } from "src/hydraulic-model";

export const hoveredAssetIdAtom = atom<AssetId | null>(null);
