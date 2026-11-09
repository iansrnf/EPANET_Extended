import type { Getter, Setter } from "jotai";
import { useAtomCallback } from "jotai/utils";
import {
  type DeviceLocation,
  type DeviceLocationError,
  deviceLocationAtom,
  deviceLocationErrorAtom,
  deviceLocationInitialRequestedAtom,
  deviceLocationNavigationRevisionAtom,
  deviceLocationRequestIdAtom,
  deviceLocationStatusAtom,
  deviceLocationViewportRequestAtom,
} from "src/state/device-location";
import { mapViewportAtom } from "src/state/map";

export type LocateDeviceOptions = { initial?: boolean };

export const locateDevice = async (
  get: Getter,
  set: Setter,
  { initial = false }: LocateDeviceOptions = {},
): Promise<void> => {
  if (initial) {
    if (get(deviceLocationInitialRequestedAtom)) return;
    set(deviceLocationInitialRequestedAtom, true);
  }
  if (get(deviceLocationStatusAtom) === "locating") return;

  const expectedViewport = get(mapViewportAtom);
  const navigationRevision = get(deviceLocationNavigationRevisionAtom);
  const requestId = get(deviceLocationRequestIdAtom) + 1;
  set(deviceLocationRequestIdAtom, requestId);
  set(deviceLocationViewportRequestAtom, null);
  set(deviceLocationStatusAtom, "locating");
  set(deviceLocationErrorAtom, null);

  try {
    const position = await requestPosition();
    if (get(deviceLocationRequestIdAtom) !== requestId) return;

    set(deviceLocationAtom, position);
    set(deviceLocationStatusAtom, "located");

    if (
      !initial ||
      (get(mapViewportAtom) === expectedViewport &&
        get(deviceLocationNavigationRevisionAtom) === navigationRevision)
    ) {
      set(deviceLocationViewportRequestAtom, {
        id: requestId,
        center: [position.longitude, position.latitude],
        zoom: 16,
        duration: initial ? 0 : 800,
        initial,
        navigationRevision,
        expectedViewport,
      });
    }
  } catch (error) {
    if (get(deviceLocationRequestIdAtom) !== requestId) return;
    set(deviceLocationStatusAtom, "error");
    set(deviceLocationErrorAtom, errorReason(error));
  }
};

export const useLocateDevice = () => useAtomCallback(locateDevice);

const requestPosition = (): Promise<DeviceLocation> =>
  new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      reject("insecure-context");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject("unsupported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { longitude, latitude, accuracy } = coords;
        if (
          !Number.isFinite(longitude) ||
          !Number.isFinite(latitude) ||
          Math.abs(longitude) > 180 ||
          Math.abs(latitude) > 90
        ) {
          reject("unavailable");
          return;
        }
        resolve({
          longitude,
          latitude,
          accuracy:
            Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
        });
      },
      (error) => reject(error),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });

const errorReason = (error: unknown): DeviceLocationError => {
  if (error === "unsupported" || error === "insecure-context") return error;
  if (error && typeof error === "object") {
    if ("code" in error && error.code === 1) return "permission-denied";
    if ("code" in error && error.code === 3) return "timeout";
    if (
      "name" in error &&
      (error.name === "NotAllowedError" || error.name === "SecurityError")
    ) {
      return "permission-denied";
    }
  }
  return "unavailable";
};
