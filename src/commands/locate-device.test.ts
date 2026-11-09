import { createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deviceLocationAtom,
  deviceLocationErrorAtom,
  deviceLocationNavigationRevisionAtom,
  deviceLocationStatusAtom,
  deviceLocationViewportRequestAtom,
} from "src/state/device-location";
import { mapViewportAtom } from "src/state/map";
import { locateDevice } from "./locate-device";

vi.mock("@epanet-js/map", () => ({
  DEFAULT_CENTER: [-4.3800042, 55.914314],
  DEFAULT_ZOOM: 15.5,
}));

let store: ReturnType<typeof createStore>;
let success: PositionCallback;
let failure: PositionErrorCallback;
const getCurrentPosition = vi.fn(
  (onSuccess: PositionCallback, onError: PositionErrorCallback) => {
    success = onSuccess;
    failure = onError;
  },
);

beforeEach(() => {
  store = createStore();
  getCurrentPosition.mockClear();
  vi.stubGlobal("navigator", {
    geolocation: { getCurrentPosition },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("locate device", () => {
  it("sets the initial location and requests a street-level viewport", async () => {
    const expectedViewport = store.get(mapViewportAtom);
    const pending = locateDevice(store.get, store.set, { initial: true });

    expect(store.get(deviceLocationStatusAtom)).toBe("locating");
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );

    success(position());
    await pending;

    expect(store.get(deviceLocationAtom)).toEqual({
      longitude: 125.17,
      latitude: 6.12,
      accuracy: 12,
    });
    expect(store.get(deviceLocationStatusAtom)).toBe("located");
    expect(store.get(deviceLocationViewportRequestAtom)).toMatchObject({
      center: [125.17, 6.12],
      zoom: 16,
      duration: 0,
      initial: true,
    });
    expect(store.get(deviceLocationViewportRequestAtom)?.expectedViewport).toBe(
      expectedViewport,
    );
  });

  it("does not automatically locate again after the first attempt", async () => {
    const pending = locateDevice(store.get, store.set, { initial: true });
    success(position());
    await pending;
    store.set(deviceLocationViewportRequestAtom, null);

    await locateDevice(store.get, store.set, { initial: true });

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(store.get(deviceLocationViewportRequestAtom)).toBeNull();
  });

  it("requests a fresh position and animated recenter after panning", async () => {
    const initial = locateDevice(store.get, store.set, { initial: true });
    success(position());
    await initial;
    store.set(mapViewportAtom, { center: [120, 10], zoom: 12 });

    const retry = locateDevice(store.get, store.set);
    success(position({ longitude: 125.18, latitude: 6.13 }));
    await retry;

    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(store.get(deviceLocationViewportRequestAtom)).toMatchObject({
      center: [125.18, 6.13],
      zoom: 16,
      duration: 800,
      initial: false,
    });
  });

  it.each(["viewport", "interaction"])(
    "preserves navigation made during initial lookup through %s",
    async (navigation) => {
      const pending = locateDevice(store.get, store.set, { initial: true });
      if (navigation === "viewport") {
        store.set(mapViewportAtom, { center: [120, 10], zoom: 12 });
      } else {
        store.set(
          deviceLocationNavigationRevisionAtom,
          (revision) => revision + 1,
        );
      }

      success(position());
      await pending;

      expect(store.get(deviceLocationAtom)).toMatchObject({
        longitude: 125.17,
      });
      expect(store.get(deviceLocationViewportRequestAtom)).toBeNull();
    },
  );

  it("deduplicates location requests while one is pending", async () => {
    const pending = locateDevice(store.get, store.set, { initial: true });
    await locateDevice(store.get, store.set);
    await locateDevice(store.get, store.set, { initial: true });

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    success(position());
    await pending;
  });

  it("does not automatically repeat denied requests and allows explicit retry", async () => {
    const initial = locateDevice(store.get, store.set, { initial: true });
    failure(positionError(1));
    await initial;
    await locateDevice(store.get, store.set, { initial: true });

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(store.get(deviceLocationErrorAtom)).toBe("permission-denied");
    expect(store.get(deviceLocationViewportRequestAtom)).toBeNull();

    const retry = locateDevice(store.get, store.set);
    expect(store.get(deviceLocationErrorAtom)).toBeNull();
    success(position());
    await retry;

    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(store.get(deviceLocationStatusAtom)).toBe("located");
  });

  it.each([
    [2, "unavailable"],
    [3, "timeout"],
  ] as const)("handles browser error %s as %s", async (code, reason) => {
    const fallbackViewport = store.get(mapViewportAtom);
    const pending = locateDevice(store.get, store.set);
    failure(positionError(code));
    await pending;

    expect(store.get(deviceLocationStatusAtom)).toBe("error");
    expect(store.get(deviceLocationErrorAtom)).toBe(reason);
    expect(store.get(mapViewportAtom)).toBe(fallbackViewport);
    expect(store.get(deviceLocationViewportRequestAtom)).toBeNull();
  });

  it("handles unsupported geolocation without moving the map", async () => {
    vi.stubGlobal("navigator", {});
    const fallbackViewport = store.get(mapViewportAtom);

    await locateDevice(store.get, store.set, { initial: true });

    expect(store.get(deviceLocationErrorAtom)).toBe("unsupported");
    expect(store.get(mapViewportAtom)).toBe(fallbackViewport);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("explains insecure contexts without requesting location", async () => {
    vi.stubGlobal("window", { isSecureContext: false });

    await locateDevice(store.get, store.set);

    expect(store.get(deviceLocationErrorAtom)).toBe("insecure-context");
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("keeps the last location when a later request fails", async () => {
    const initial = locateDevice(store.get, store.set);
    success(position());
    await initial;
    const lastLocation = store.get(deviceLocationAtom);
    store.set(deviceLocationViewportRequestAtom, null);

    const retry = locateDevice(store.get, store.set);
    failure(positionError(3));
    await retry;

    expect(store.get(deviceLocationAtom)).toBe(lastLocation);
    expect(store.get(deviceLocationViewportRequestAtom)).toBeNull();
  });

  it("does not apply invalid coordinates", async () => {
    const pending = locateDevice(store.get, store.set);
    success(position({ latitude: 100 }));
    await pending;

    expect(store.get(deviceLocationErrorAtom)).toBe("unavailable");
    expect(store.get(deviceLocationAtom)).toBeNull();
    expect(store.get(deviceLocationViewportRequestAtom)).toBeNull();
  });

  it("keeps a valid point when accuracy is unavailable", async () => {
    const pending = locateDevice(store.get, store.set);
    success(position({ accuracy: Number.NaN }));
    await pending;

    expect(store.get(deviceLocationAtom)?.accuracy).toBeNull();
    expect(store.get(deviceLocationStatusAtom)).toBe("located");
  });
});

const position = (
  coords: Partial<GeolocationCoordinates> = {},
): GeolocationPosition => ({
  coords: {
    longitude: 125.17,
    latitude: 6.12,
    accuracy: 12,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    ...coords,
    toJSON: () => ({}),
  },
  timestamp: Date.now(),
  toJSON: () => ({}),
});

const positionError = (code: number): GeolocationPositionError => ({
  code,
  message: "Location request failed",
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
});
