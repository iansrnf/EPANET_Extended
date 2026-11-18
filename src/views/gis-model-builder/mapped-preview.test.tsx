import type { Feature } from "geojson";
import { initialSettings, type BuilderLayer } from "./data";
import { mappedPreviewOf } from "./mapped-preview";

describe("mapped import preview", () => {
  it("uses the engine's year parsing, unit conversion, and invalid numeric fallback", () => {
    const layer = aLayer("pipe", {
      diameter: "invalid",
      installed: "1960-10-29",
      roughness: "missing",
    });
    layer.mapping = {
      diameter: "diameter",
      year: "installed",
      roughness: "roughness",
    };
    layer.defaults = { diameter: 2, initialStatus: "open" };
    layer.units = { diameter: "in" };

    const { cells } = mappedPreviewOf(layer, initialSettings(), []).rows[0];

    expect(cells.diameter.value).toBeCloseTo(50.8);
    expect(cells.diameter.fromDefault).toBe(true);
    expect(cells.diameter.warning).toContain("Imported value");
    expect(cells.year).toEqual({
      value: 1960,
      fromDefault: false,
      warning: undefined,
    });
    expect(cells.roughness.value).toBeUndefined();
    expect(cells.roughness.warning).toContain("empty");
    expect(cells.label).toEqual({
      value: "P1",
      fromDefault: true,
      warning: undefined,
    });
  });

  it("shows converted daily customer demand", () => {
    const layer = aLayer("customerPoint", { daily: 1 });
    layer.mapping = { demand: "daily" };
    layer.units = { customerDemand: "gal/d" };

    const preview = mappedPreviewOf(layer, initialSettings(), []);

    expect(preview.columns.find(({ key }) => key === "demand")?.unit).toBe(
      "l/d",
    );
    expect(preview.rows[0].cells.demand.value).toBeCloseTo(3.785411784);
    expect(preview.rows[0].cells.demand.fromDefault).toBe(false);
    expect(preview.rows[0].cells.longitude.value).toBe(120);
    expect(preview.rows[0].cells.latitude.value).toBe(6);
  });

  it("does not invent a reservoir head from its geometry or terrain option", () => {
    const layer = aLayer("reservoir", {});
    layer.features[0].geometry = { type: "Point", coordinates: [120, 6, 150] };

    const { cells } = mappedPreviewOf(
      layer,
      { ...initialSettings(), fetchElevations: true },
      [],
    ).rows[0];

    expect(cells.head.value).toBeUndefined();
    expect(cells.head.fromDefault).toBe(false);
  });

  it("shows the actual valve fallbacks for invalid kind, setting, and status", () => {
    const layer = aLayer("valve", {
      type: "unknown",
      setting: "bad",
      status: "invalid",
    });
    layer.mapping = {
      kind: "type",
      setting: "setting",
      initialStatus: "status",
    };
    layer.defaults = { kind: "tcv", setting: 10 };

    const { cells } = mappedPreviewOf(layer, initialSettings(), []).rows[0];

    expect(cells.kind.value).toBe("tcv");
    expect(cells.setting.value).toBe(10);
    expect(cells.initialStatus.value).toBe("active");
    for (const key of ["kind", "setting", "initialStatus"]) {
      expect(cells[key].warning).toContain("Imported value");
      expect(cells[key].fromDefault).toBe(true);
    }
  });
});

const aLayer = (
  role: BuilderLayer["role"],
  properties: Record<string, unknown>,
): BuilderLayer => {
  const feature: Feature = {
    type: "Feature",
    properties,
    geometry:
      role === "pipe"
        ? {
            type: "LineString",
            coordinates: [
              [120, 6],
              [120.001, 6],
            ],
          }
        : { type: "Point", coordinates: [120, 6] },
  };
  return {
    id: "1",
    name: "source",
    sourceId: "source",
    sourceName: "source.geojson",
    geometry: role === "pipe" ? "line" : "point",
    role,
    features: [feature],
    enabled: true,
  };
};
