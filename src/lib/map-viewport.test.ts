import type { InitialViewport } from "@epanet-js/map";
import { captureMapViewport } from "./map-viewport";

describe("captureMapViewport", () => {
  it("preserves viewport identity for an unchanged flat camera", () => {
    const previous: InitialViewport = { center: [125.18, 6.12], zoom: 15 };

    expect(captureMapViewport(aCamera(), previous)).toBe(previous);
  });

  it("preserves viewport identity for unchanged orientation", () => {
    const previous: InitialViewport = {
      center: [125.18, 6.12],
      zoom: 15,
      pitch: 60,
      bearing: 30,
    };

    expect(
      captureMapViewport(aCamera({ pitch: 60, bearing: 30 }), previous),
    ).toBe(previous);
  });

  it.each([
    { center: [126, 7] as [number, number] },
    { zoom: 16 },
    { pitch: 60 },
    { bearing: 30 },
  ])("captures a changed camera including orientation: %o", (changes) => {
    const previous: InitialViewport = { center: [125.18, 6.12], zoom: 15 };

    const captured = captureMapViewport(aCamera(changes), previous);

    expect(captured).not.toBe(previous);
    expect(captured).toEqual({
      center: [125.18, 6.12],
      zoom: 15,
      pitch: 0,
      bearing: 0,
      ...changes,
    });
    expect(previous).toEqual({ center: [125.18, 6.12], zoom: 15 });
  });
});

const aCamera = ({
  center = [125.18, 6.12],
  zoom = 15,
  pitch = 0,
  bearing = 0,
}: {
  center?: [number, number];
  zoom?: number;
  pitch?: number;
  bearing?: number;
} = {}): Parameters<typeof captureMapViewport>[0] => ({
  getCenter: () => ({ toArray: () => center }),
  getZoom: () => zoom,
  getPitch: () => pitch,
  getBearing: () => bearing,
});
