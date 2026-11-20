import { getCursorCoordinates } from "./cursor-coordinates";

describe("cursor coordinates", () => {
  it("rounds longitude and latitude to six decimal places", () => {
    expect(getCursorCoordinates(125.123456789, 6.987654321)).toEqual({
      longitude: 125.123457,
      latitude: 6.987654,
    });
    expect(getCursorCoordinates(-125.123456789, -6.987654321)).toEqual({
      longitude: -125.123457,
      latitude: -6.987654,
    });
  });

  it.each([
    [190, -170],
    [-190, 170],
    [725.25, 5.25],
    [-725.25, -5.25],
    [360_000_000_000_012, 12],
    [-360_000_000_000_012, -12],
  ])("wraps world-copy longitude %s to %s", (longitude, expected) => {
    expect(getCursorCoordinates(longitude, 5)).toEqual({
      longitude: expected,
      latitude: 5,
    });
  });

  it.each([
    [180, 180],
    [-180, -180],
    [540, 180],
    [-540, -180],
    [179.9999999, 180],
    [-179.9999999, -180],
  ])("preserves the signed antimeridian for %s", (longitude, expected) => {
    expect(getCursorCoordinates(longitude, 0)?.longitude).toBe(expected);
  });

  it("accepts both poles and keeps very large world values finite", () => {
    expect(getCursorCoordinates(10, 90)).toEqual({
      longitude: 10,
      latitude: 90,
    });
    expect(getCursorCoordinates(10, -90)).toEqual({
      longitude: 10,
      latitude: -90,
    });
    const coordinates = getCursorCoordinates(Number.MAX_VALUE, 90);
    expect(coordinates).not.toBeNull();
    expect(coordinates?.longitude).toBeGreaterThanOrEqual(-180);
    expect(coordinates?.longitude).toBeLessThanOrEqual(180);
    expect(Number.isFinite(coordinates?.longitude)).toBe(true);
  });

  it.each([
    [NaN, 0],
    [Infinity, 0],
    [-Infinity, 0],
    [0, NaN],
    [0, Infinity],
    [0, -Infinity],
    [0, 90.0000001],
    [0, -90.0000001],
  ])("rejects invalid coordinates %s, %s", (longitude, latitude) => {
    expect(getCursorCoordinates(longitude, latitude)).toBeNull();
  });

  it.each([
    [-0, -0],
    [-360, -0.0000001],
    [360, 0.0000001],
    [-0.0000001, -0.0000001],
  ])("normalizes negative zero for %s, %s", (longitude, latitude) => {
    const coordinates = getCursorCoordinates(longitude, latitude);
    expect(coordinates).toEqual({ longitude: 0, latitude: 0 });
    expect(Object.is(coordinates?.longitude, -0)).toBe(false);
    expect(Object.is(coordinates?.latitude, -0)).toBe(false);
  });
});
