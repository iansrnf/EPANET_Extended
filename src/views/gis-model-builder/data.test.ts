import type { Feature } from "geojson";
import { vi } from "vitest";
import {
  featuresForLayer,
  initialSettings,
  layersForSource,
  parseBuildRecipe,
  restoreSourceLayers,
  saveBuildRecipe,
  sourceUnitsFor,
  type BuilderSource,
} from "./data";

const IDS = { J1: 1, R1: 2, J2: 3 } as const;

describe("GIS build settings", () => {
  it("saves projection and mapping recipes without GIS bytes or records", () => {
    const source = sourceWithFeatures([point(IDS.J1, [125.1, 6.1])]);
    const settings = initialSettings();
    const layers = layersForSource(source, settings);

    const recipe = parseBuildRecipe(
      JSON.parse(JSON.stringify(saveBuildRecipe(settings, layers, [source]))),
    );

    expect(recipe.sourceNames).toEqual(["junctions.csv"]);
    expect(recipe.sourceSettings).toEqual([
      {
        name: "junctions.csv",
        epsg: 32651,
        coordinateAttributes: { x: "Easting", y: "Northing" },
      },
    ]);
    expect(recipe.layers[0].mapping?.label).toBe("id");
    expect(JSON.stringify(recipe)).not.toContain("PRIVATE_GIS_DATA");
    expect(recipe.layers[0]).not.toHaveProperty("features");
    expect(recipe.layers[0]).not.toHaveProperty("sourceId");
    expect(source.files[0].arrayBuffer).not.toHaveBeenCalled();
  });

  it("uses re-read geometry when restoring a source recipe", () => {
    const original = sourceWithFeatures([point(IDS.J1, [125.1, 6.1])]);
    const settings = initialSettings();
    const recipe = parseBuildRecipe(
      JSON.parse(
        JSON.stringify(
          saveBuildRecipe(settings, layersForSource(original, settings), [
            original,
          ]),
        ),
      ),
    );
    const reRead = sourceWithFeatures([point(IDS.J1, [126.2, 7.2])]);
    reRead.id = "re-read-source";

    const [restored] = restoreSourceLayers(reRead, recipe);

    expect(restored.sourceId).toBe("re-read-source");
    expect(restored.features).toBe(reRead.groups[0].features);
    expect(restored.features[0].geometry).toEqual({
      type: "Point",
      coordinates: [126.2, 7.2],
    });
  });

  it("preserves first-match assignment partitions after a settings round trip", () => {
    const source = sourceWithFeatures([
      point(IDS.J1, [125.1, 6.1], "ignore"),
      point(IDS.R1, [125.2, 6.2], "reservoir"),
      point(IDS.J2, [125.3, 6.3], "junction"),
    ]);
    const settings = initialSettings();
    const [layer] = layersForSource(source, settings);
    layer.partition = {
      groupId: "assignment-group",
      rules: [
        {
          name: "Ignore",
          role: null,
          conditions: [
            { attribute: "type", operator: "equals", value: "ignore" },
          ],
        },
        {
          name: "Storage",
          role: "reservoir",
          conditions: [
            { attribute: "type", operator: "equals", value: "reservoir" },
          ],
        },
      ],
      index: "fallback",
      fallbackRole: "junction",
    };
    const recipe = parseBuildRecipe(
      JSON.parse(JSON.stringify(saveBuildRecipe(settings, [layer], [source]))),
    );

    const [restored] = restoreSourceLayers(source, recipe);

    expect(restored.partition?.groupId).toBe("assignment-group");
    expect(restored.partition?.rules[0].role).toBeNull();
    expect(
      featuresForLayer(restored).map(({ properties }) =>
        Number(properties?.id),
      ),
    ).toEqual([IDS.J2]);
  });

  it("rejects unsupported source units when loading a settings file", () => {
    const source = sourceWithFeatures([point(IDS.J1, [125.1, 6.1])]);
    const settings = initialSettings();
    const recipe = saveBuildRecipe(
      settings,
      layersForSource(source, settings),
      [source],
    );
    const invalid: unknown = {
      ...recipe,
      layers: recipe.layers.map((layer) => ({
        ...layer,
        units: { diameter: "unknown-unit" },
      })),
    };

    expect(() => parseBuildRecipe(invalid)).toThrow();
  });

  it("keeps daily customer demand units independent from hydraulic flow units", () => {
    const metric = { ...initialSettings(), flowUnit: "m^3/h" as const };
    const imperial = {
      ...initialSettings(),
      unitSystem: "us" as const,
      flowUnit: "ft^3/s" as const,
    };

    expect(sourceUnitsFor(metric)).toMatchObject({
      flow: "m^3/h",
      customerDemand: "l/d",
    });
    expect(sourceUnitsFor(imperial)).toMatchObject({
      flow: "ft^3/s",
      customerDemand: "gal/d",
    });
  });
});

const sourceWithFeatures = (features: Feature[]): BuilderSource => ({
  id: "source",
  name: "junctions.csv",
  fileNames: ["junctions.csv"],
  files: [
    { name: "junctions.csv", arrayBuffer: vi.fn<() => Promise<ArrayBuffer>>() },
  ],
  features,
  attributes: [
    { name: "id", type: "number", onEveryRecord: true },
    { name: "type", type: "text", onEveryRecord: true },
  ],
  groups: [
    {
      geometry: "point",
      features,
      attributes: [
        { name: "id", type: "number", onEveryRecord: true },
        { name: "type", type: "text", onEveryRecord: true },
      ],
    },
  ],
  projection: "WGS84",
  warnings: [],
  status: "ready",
  epsg: 32651,
  coordinateAttributes: { x: "Easting", y: "Northing" },
});

const point = (
  id: number,
  coordinates: number[],
  type = "junction",
): Feature => ({
  type: "Feature",
  properties: { id, type, confidentialValue: "PRIVATE_GIS_DATA" },
  geometry: { type: "Point", coordinates },
});
