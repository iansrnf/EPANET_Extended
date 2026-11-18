import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { MultiPolygon, Polygon } from "geojson";
import { getZonePanelAnchor } from "./floating-panel-anchor";

describe("getZonePanelAnchor", () => {
  it("keeps a concave zone anchor inside its geometry", () => {
    const geometry: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 2],
          [2, 2],
          [2, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    };
    const anchor = getZonePanelAnchor(geometry)!;

    expect(
      booleanPointInPolygon(anchor, geometry, { ignoreBoundary: true }),
    ).toBe(true);
  });

  it("avoids holes without changing the stored geometry", () => {
    const geometry: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [3, 3],
          [7, 3],
          [7, 7],
          [3, 7],
          [3, 3],
        ],
      ],
    };
    const original = structuredClone(geometry);
    const anchor = getZonePanelAnchor(geometry)!;

    expect(
      booleanPointInPolygon(anchor, geometry, { ignoreBoundary: true }),
    ).toBe(true);
    expect(geometry).toEqual(original);
  });

  it("anchors within a multipart zone instead of between its parts", () => {
    const geometry: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [10, 0],
            [14, 0],
            [14, 4],
            [10, 4],
            [10, 0],
          ],
        ],
      ],
    };
    const anchor = getZonePanelAnchor(geometry)!;

    expect(
      booleanPointInPolygon(anchor, geometry, { ignoreBoundary: true }),
    ).toBe(true);
    expect(anchor[0]).toBeGreaterThan(10);
  });

  it("uses a boundary fallback for thin parts while preferring another part's interior", () => {
    const thin: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [101, 0],
          [101, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    };
    expect(getZonePanelAnchor(thin)).toEqual(thin.coordinates[0][0]);

    const multipart: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        thin.coordinates,
        [
          [
            [110, 0],
            [114, 0],
            [114, 4],
            [110, 4],
            [110, 0],
          ],
        ],
      ],
    };
    const anchor = getZonePanelAnchor(multipart)!;
    expect(anchor[0]).toBeGreaterThan(110);
    expect(
      booleanPointInPolygon(anchor, multipart, { ignoreBoundary: true }),
    ).toBe(true);
  });

  it("bounds detailed polygons including their holes", () => {
    const hole = Array.from({ length: 4999 }, (_, index) => {
      const angle = (index / 4999) * Math.PI * 2;
      return [5 + Math.cos(angle), 5 + Math.sin(angle)];
    });
    hole.push(hole[0]);
    const geometry: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        hole,
      ],
    };
    const anchor = getZonePanelAnchor(geometry)!;

    expect(anchor).toEqual(geometry.coordinates[0][0]);
    expect(booleanPointInPolygon(anchor, geometry)).toBe(true);
  });

  it.each([
    { type: "Polygon", coordinates: [] } as Polygon,
    { type: "MultiPolygon", coordinates: [] } as MultiPolygon,
  ])("has no anchor for an empty $type", (geometry) => {
    expect(getZonePanelAnchor(geometry)).toBeUndefined();
  });
});
