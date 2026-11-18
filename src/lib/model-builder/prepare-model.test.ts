import {
  assetsToRows,
  customerPointsToRows,
  serializeProjectSettings,
} from "@epanet-js/ejsdb-mappers";
import { defaultProjectSettings } from "@epanet-js/project-settings";
import { Pipe, isNodeAsset } from "@epanet-js/hydraulic-model";
import { createFakeElevationEngine } from "@epanet-js/elevations";
import {
  getElevationEngine,
  registerElevationEngine,
  type ElevationSource,
} from "src/lib/elevations";
import { prepareGisModel } from "./prepare-model";
import type { NetworkLayer, NetworkBuildOptions } from "./network";

const options: NetworkBuildOptions = {
  units: {
    flow: "l/s",
    diameter: "mm",
    elevation: "m",
    length: "m",
    customerDemand: "l/d",
  },
  headlossFormula: "H-W",
  snapTolerance: 0.1,
};

const configuration = {
  projections: new Map(),
  labelMaxLength: 255,
  elevationSources: [],
};

describe("prepareGisModel", () => {
  it("builds a model whose mapped assets and customer demands validate for saving", async () => {
    const layers: NetworkLayer[] = [
      {
        id: "mains",
        name: "Water mains",
        role: "pipe",
        features: [
          {
            type: "Feature",
            properties: { id: "Main", diameter: 150, material: "PVC" },
            geometry: {
              type: "LineString",
              coordinates: [
                [125, 6],
                [125.001, 6],
              ],
            },
          },
        ],
        mapping: { label: "id", diameter: "diameter", material: "material" },
        customAttributes: ["material"],
        defaults: { initialStatus: "open" },
      },
      {
        id: "customers",
        name: "Customers",
        role: "customerPoint",
        features: [
          {
            type: "Feature",
            properties: { daily: 86400 },
            geometry: { type: "Point", coordinates: [125, 6.0001] },
          },
        ],
        mapping: { demand: "daily" },
      },
    ];
    const prepared = await prepareGisModel(
      layers,
      options,
      {
        name: "Rosebery: test/model",
        flowUnit: "l/s",
        unitSystem: "metric",
        fetchElevations: false,
      },
      configuration,
    );

    const { hydraulicModel } = prepared.model;
    const pipe = [...hydraulicModel.assets.values()].find(
      (asset) => asset.type === "pipe",
    );
    expect(pipe?.type).toBe("pipe");
    if (!(pipe instanceof Pipe)) throw new Error("Pipe was not built");
    expect(pipe.diameter).toBe(150);
    expect(pipe.roughness).toBeNull();
    expect(hydraulicModel.customAttributes.size).toBe(1);
    expect(prepared.name).toBe("Rosebery testmodel");
    expect(prepared.report.summary.customerPoints).toBe(1);
    expect(
      Object.values(assetsToRows(hydraulicModel.assets.values())).flat(),
    ).toHaveLength(3);
    expect(
      customerPointsToRows(
        hydraulicModel.customerPoints,
        hydraulicModel.demands.customerPoints,
      ).customerPoints,
    ).toHaveLength(1);
    expect(() =>
      serializeProjectSettings({
        ...defaultProjectSettings,
        ...prepared.model.projectSettings,
        name: prepared.name,
      }),
    ).not.toThrow();
  });

  it("reports missing terrain without inventing elevations", async () => {
    const prepared = await prepareGisModel(
      [pipeLayer()],
      options,
      {
        name: "Terrain test",
        flowUnit: "l/s",
        unitSystem: "metric",
        fetchElevations: true,
      },
      configuration,
    );

    expect(
      prepared.report.issues.some((issue) =>
        issue.message.includes("no terrain source"),
      ),
    ).toBe(true);
    const junctions = [...prepared.model.hydraulicModel.assets.values()].filter(
      isNodeAsset,
    );
    expect(junctions).toHaveLength(2);
    expect(junctions.every((junction) => junction.elevation === null)).toBe(
      true,
    );
  });

  it("honors cancellation before building or fetching terrain", async () => {
    const abortController = new AbortController();
    abortController.abort();
    await expect(
      prepareGisModel(
        [pipeLayer()],
        options,
        {
          name: "Cancelled",
          flowUnit: "l/s",
          unitSystem: "metric",
          signal: abortController.signal,
        },
        configuration,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps source Z elevations and looks up only missing nodes", async () => {
    const originalEngine = getElevationEngine();
    const fetchElevations = vi.fn().mockResolvedValue([25]);
    registerElevationEngine(createFakeElevationEngine({ fetchElevations }));
    const source: ElevationSource = {
      type: "tile-server",
      id: "terrain",
      enabled: true,
      tileUrlTemplate: "https://terrain.example/{z}/{x}/{y}",
      tileZoom: 14,
      tileSize: 512,
      encoding: "terrain-rgb",
      elevationOffsetM: 0,
    };
    try {
      const layer = pipeLayer();
      layer.features = [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [125, 6, 12],
              [125.001, 6],
            ],
          },
        },
      ];
      const prepared = await prepareGisModel(
        [layer],
        options,
        {
          name: "Terrain",
          flowUnit: "l/s",
          unitSystem: "metric",
          fetchElevations: true,
        },
        { ...configuration, elevationSources: [source] },
      );
      expect(fetchElevations).toHaveBeenCalledWith(
        [source],
        [{ lng: 125.001, lat: 6 }],
        "m",
        expect.any(Object),
      );
      const elevations = [...prepared.model.hydraulicModel.assets.values()]
        .filter(isNodeAsset)
        .map((node) => node.elevation);
      expect(elevations).toEqual([12, 25]);
      expect(
        Object.values(
          assetsToRows(prepared.model.hydraulicModel.assets.values()),
        ).flat(),
      ).toHaveLength(3);
    } finally {
      registerElevationEngine(originalEngine);
    }
  });
});

const pipeLayer = (): NetworkLayer => ({
  id: "mains",
  name: "Mains",
  role: "pipe",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [125, 6],
          [125.001, 6],
        ],
      },
    },
  ],
});
