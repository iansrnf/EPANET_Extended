import { describe, it, expect } from "vitest";
import { defaultNodeSizeConfig } from "src/map/symbology";
import { LAYER_MAX_ZOOM } from "@epanet-js/map";
import { junctionCircleRadius, junctionLayerMinZoom } from "./junctions";
import { junctionFeedbackRadius } from "./asset-feedback";

describe("junctionCircleRadius", () => {
  it("interpolates minSize at minVisibleZoom up to maxSize at LAYER_MAX_ZOOM", () => {
    expect(junctionCircleRadius(defaultNodeSizeConfig)).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      defaultNodeSizeConfig.minVisibleZoom,
      defaultNodeSizeConfig.minSize,
      LAYER_MAX_ZOOM,
      defaultNodeSizeConfig.maxSize,
    ]);
  });

  it("uses the configured min zoom and sizes as the interpolation stops", () => {
    expect(
      junctionCircleRadius({
        minVisibleZoom: 14,
        minSize: 2,
        maxSize: 12,
      }),
    ).toEqual(["interpolate", ["linear"], ["zoom"], 14, 2, LAYER_MAX_ZOOM, 12]);
  });

  it("returns a flat radius (no interpolation) when min and max size are equal", () => {
    expect(
      junctionCircleRadius({ minVisibleZoom: 12, minSize: 4, maxSize: 4 }),
    ).toBe(4);
  });

  it("returns a flat maxSize when minVisibleZoom is at the upper stop", () => {
    expect(
      junctionCircleRadius({
        minVisibleZoom: LAYER_MAX_ZOOM,
        minSize: 2,
        maxSize: 12,
      }),
    ).toBe(12);
  });
});

describe("junctionLayerMinZoom", () => {
  it("uses the configured min visible zoom", () => {
    expect(
      junctionLayerMinZoom({ minVisibleZoom: 12, minSize: 1, maxSize: 5 }),
    ).toBe(12);
  });

  it("clamps to the style-spec layer max (24) above it", () => {
    expect(
      junctionLayerMinZoom({ minVisibleZoom: 26, minSize: 1, maxSize: 5 }),
    ).toBe(LAYER_MAX_ZOOM);
  });
});

describe("junctionFeedbackRadius", () => {
  it("keeps the selection ring outside the configured node at both zoom stops", () => {
    expect(
      junctionFeedbackRadius({ minVisibleZoom: 14, minSize: 2, maxSize: 12 }),
    ).toEqual(["interpolate", ["linear"], ["zoom"], 14, 6, LAYER_MAX_ZOOM, 16]);
  });

  it("keeps a fixed-size selection ring outside a fixed-size node", () => {
    expect(
      junctionFeedbackRadius({ minVisibleZoom: 12, minSize: 4, maxSize: 4 }),
    ).toBe(8);
  });

  it.each([LAYER_MAX_ZOOM, LAYER_MAX_ZOOM + 2])(
    "keeps zoom stops valid when nodes appear at zoom %s",
    (minVisibleZoom) => {
      expect(
        junctionFeedbackRadius({ minVisibleZoom, minSize: 2, maxSize: 12 }),
      ).toBe(16);
    },
  );
});
