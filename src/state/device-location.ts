import { atom } from "jotai";
import type { InitialViewport } from "@epanet-js/map";

export type DeviceLocation = {
  longitude: number;
  latitude: number;
  accuracy: number | null;
};

export type DeviceLocationStatus = "idle" | "locating" | "located" | "error";

export type DeviceLocationError =
  | "permission-denied"
  | "unavailable"
  | "timeout"
  | "unsupported"
  | "insecure-context";

export type DeviceLocationViewportRequest = {
  id: number;
  center: [number, number];
  zoom: number;
  duration: number;
  initial: boolean;
  navigationRevision: number;
  expectedViewport: InitialViewport;
};

export const deviceLocationAtom = atom<DeviceLocation | null>(null);
export const deviceLocationStatusAtom = atom<DeviceLocationStatus>("idle");
export const deviceLocationErrorAtom = atom<DeviceLocationError | null>(null);
export const deviceLocationInitialRequestedAtom = atom(false);
export const deviceLocationNavigationRevisionAtom = atom(0);
export const deviceLocationRequestIdAtom = atom(0);
export const deviceLocationViewportRequestAtom =
  atom<DeviceLocationViewportRequest | null>(null);
