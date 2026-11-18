import type { Feature, LineString, Point, Position } from "geojson";
import {
  buildNetworkFromLayers,
  matchesNetworkFilter,
  type NetworkBuildOptions,
  type NetworkLayer,
} from "./index";

const options: NetworkBuildOptions = {
  units: {
    flow: "l/s",
    customerDemand: "l/s",
    elevation: "m",
    level: "m",
    diameter: "mm",
    tankDiameter: "m",
    length: "m",
    volume: "m^3",
    pressure: "mwc",
  },
  headlossFormula: "H-W",
  snapTolerance: 0.1,
};

describe("buildNetworkFromLayers", () => {
  it("joins nearby pipe endpoints without flattening bends", async () => {
    const layers = [
      pipes([
        line([
          [0, 0],
          [10, 5],
          [20, 0],
        ]),
        line([
          [20.05, 0],
          [40, 0],
        ]),
      ]),
    ];
    const { network } = await buildNetworkFromLayers(layers, options);

    expect(network.junctions).toHaveLength(3);
    expect(network.pipes).toHaveLength(2);
    expect(network.pipes[0].endNodeRef).toBe(network.pipes[1].startNodeRef);
    expect(network.pipes[0].vertices).toEqual([position(10, 5)]);
  });

  it("splits a pipe where another pipe ends on it", async () => {
    const { network, summary } = await buildNetworkFromLayers(
      [
        pipes([
          line([
            [0, 0],
            [20, 0],
          ]),
          line([
            [10, 0],
            [10, 10],
          ]),
        ]),
      ],
      options,
    );

    expect(network.junctions).toHaveLength(4);
    expect(network.pipes).toHaveLength(3);
    expect(summary.splitPipes).toBe(1);
    expect(summary.components).toBe(1);
  });

  it("keeps ordinary crossings disconnected unless requested", async () => {
    const layers = [
      pipes([
        line([
          [0, 0],
          [20, 0],
        ]),
        line([
          [10, -10],
          [10, 10],
        ]),
      ]),
    ];
    const separate = await buildNetworkFromLayers(layers, options);
    expect(separate.network.pipes).toHaveLength(2);
    expect(separate.summary.components).toBe(2);

    const connected = await buildNetworkFromLayers(layers, {
      ...options,
      splitAtIntersections: true,
    });
    expect(connected.network.junctions).toHaveLength(5);
    expect(connected.network.pipes).toHaveLength(4);
    expect(connected.summary.components).toBe(1);
  });

  it("splits every nearby pipe at an explicitly assigned junction", async () => {
    const { network } = await buildNetworkFromLayers(
      [
        pipes([
          line([
            [0, 0],
            [20, 0],
          ]),
          line([
            [10, -10],
            [10, 10],
          ]),
        ]),
        points(
          "junction",
          [point(10, 0, { id: "Intersection", elevation: "8.5" })],
          { mapping: { label: "id", elevation: "elevation" } },
        ),
      ],
      options,
    );

    expect(network.pipes).toHaveLength(4);
    expect(
      network.junctions.find((node) => node.label === "Intersection")
        ?.elevation,
    ).toBe(8.5);
  });

  it("does not connect a third passing pipe at an already connected endpoint", async () => {
    const { network, summary } = await buildNetworkFromLayers(
      [
        pipes([
          line([
            [-10, 0],
            [0, 0],
          ]),
          line([
            [0, 0],
            [10, 0],
          ]),
          line([
            [0, -10],
            [0, 10],
          ]),
        ]),
      ],
      options,
    );
    expect(network.pipes).toHaveLength(3);
    expect(summary.components).toBe(2);
  });

  it("preserves closed pipe geometry as a loop with distinct endpoints", async () => {
    const { network, summary } = await buildNetworkFromLayers(
      [
        pipes([
          line([
            [0, 0],
            [20, 0],
            [20, 20],
            [0, 20],
            [0, 0],
          ]),
        ]),
      ],
      options,
    );
    expect(network.junctions).toHaveLength(2);
    expect(network.pipes).toHaveLength(2);
    expect(
      network.pipes.every((pipe) => pipe.startNodeRef !== pipe.endNodeRef),
    ).toBe(true);
    expect(summary.totalPipeLengthMeters).toBeCloseTo(80, 0);
  });

  it("converts mapped units and apportions stated lengths when splitting", async () => {
    const { network } = await buildNetworkFromLayers(
      [
        pipes(
          [
            line(
              [
                [0, 0],
                [20, 0],
              ],
              { diameter: 2, length: 100 },
            ),
          ],
          {
            mapping: { diameter: "diameter", length: "length" },
            units: { diameter: "in", length: "ft" },
          },
        ),
        points("junction", [point(10, 0)]),
      ],
      options,
    );

    expect(network.pipes).toHaveLength(2);
    expect(network.pipes[0].diameter).toBeCloseTo(50.8);
    expect(
      network.pipes.reduce((sum, pipe) => sum + (pipe.length ?? 0), 0),
    ).toBeCloseTo(30.48);
  });

  it("drops loops whose full geometry collapses inside the snapping tolerance", async () => {
    const { network, issues } = await buildNetworkFromLayers(
      [
        pipes([
          line([
            [0, 0],
            [0.02, 0],
            [0.02, 0.02],
            [0, 0.02],
            [0, 0],
          ]),
        ]),
      ],
      options,
    );
    expect(network.pipes).toHaveLength(0);
    expect(issues.some((issue) => issue.code === "zeroLengthPipe")).toBe(true);
  });

  it("takes elevation from Z in source vertical units while keeping absent hydraulics blank", async () => {
    const source = line([
      [0, 0, 10],
      [20, 0, 20],
    ]);
    const { network } = await buildNetworkFromLayers(
      [pipes([source], { units: { elevation: "ft" } })],
      options,
    );
    expect(network.junctions[0].elevation).toBeCloseTo(3.048);
    expect(network.junctions[1].elevation).toBeCloseTo(6.096);
    expect(network.pipes[0].diameter).toBeUndefined();
    expect(network.pipes[0].roughness).toBeUndefined();
  });

  it("turns a point valve into a link between shortened adjacent pipes", async () => {
    const { network, summary } = await buildNetworkFromLayers(
      [
        pipes([
          line([
            [0, 0],
            [20, 0],
          ]),
        ]),
        points("valve", [point(10, 0, { type: "PRV", pressure: 20 })], {
          mapping: { kind: "type", setting: "pressure" },
        }),
      ],
      options,
    );

    expect(network.valves).toHaveLength(1);
    expect(network.pipes).toHaveLength(2);
    const valve = network.valves[0];
    expect(valve.kind).toBe("prv");
    expect(valve.initialStatus).toBe("active");
    expect(valve.startNodeRef).not.toBe(valve.endNodeRef);
    expect(summary.components).toBe(1);
    expect(summary.totalPipeLengthMeters).toBeCloseTo(19, 1);
  });

  it("keeps both endpoint pipes when inserting a pump at their shared node", async () => {
    const { network, summary } = await buildNetworkFromLayers(
      [
        pipes([
          line([
            [0, 0],
            [10, 0],
          ]),
          line([
            [10, 0],
            [20, 0],
          ]),
        ]),
        points("pump", [point(10, 0)], { defaults: { initialStatus: "open" } }),
      ],
      options,
    );
    expect(network.pipes).toHaveLength(2);
    expect(network.pumps).toHaveLength(1);
    expect(network.pumps[0].initialStatus).toBe("on");
    expect(summary.components).toBe(1);
  });

  it("leaves customer points unallocated without splitting pipes", async () => {
    const { network } = await buildNetworkFromLayers(
      [
        pipes([
          line([
            [0, 0],
            [20, 0],
          ]),
        ]),
        points("customerPoint", [point(10, 0, { q: 10 })], {
          mapping: { demand: "q" },
          units: { customerDemand: "l/min" },
        }),
      ],
      options,
    );
    expect(network.pipes).toHaveLength(1);
    expect(network.junctions).toHaveLength(2);
    expect(network.customerPoints[0].demands?.[0].baseDemand).toBeCloseTo(
      1 / 6,
    );
  });

  it("applies filters and ordered rules while preserving custom attributes", async () => {
    const { network, summary } = await buildNetworkFromLayers(
      [
        pipes(
          [
            line(
              [
                [0, 0],
                [10, 0],
              ],
              {
                retained: true,
                material: "PVC",
                width: "4",
                year: "2011-03-10",
              },
            ),
            line(
              [
                [10, 0],
                [20, 0],
              ],
              { retained: false },
            ),
          ],
          {
            mapping: { diameter: "width", year: "year" },
            defaults: { diameter: 100 },
            filters: [
              { attribute: "retained", operator: "equals", value: true },
            ],
            rules: [
              {
                attribute: "material",
                operator: "equals",
                value: "PVC",
                property: "roughness",
                result: 140,
              },
            ],
            customAttributes: ["material", "emptyColumn"],
          },
        ),
      ],
      options,
    );
    expect(network.pipes).toHaveLength(1);
    expect(network.pipes[0].diameter).toBe(4);
    expect(network.pipes[0].roughness).toBe(140);
    expect(network.pipes[0].year).toBe(2011);
    expect(network.pipes[0].customAttributes).toEqual({ material: "PVC" });
    expect(network.customAttributes).toEqual([
      { ref: "material", name: "material", type: "text" },
      { ref: "emptyColumn", name: "emptyColumn", type: "text" },
    ]);
    expect(summary.excludedFeatures).toBe(1);
  });

  it("reports invalid mapped values and uses configured numeric and enum defaults", async () => {
    const { network, issues } = await buildNetworkFromLayers(
      [
        pipes(
          [
            line(
              [
                [0, 0],
                [10, 0],
              ],
              { diameter: -10, year: 2010.5, status: "unknown", loss: -1 },
            ),
          ],
          {
            mapping: {
              diameter: "diameter",
              year: "year",
              initialStatus: "status",
              minorLoss: "loss",
            },
            defaults: { diameter: 150, initialStatus: "open" },
          },
        ),
      ],
      options,
    );
    expect(network.pipes[0].diameter).toBe(150);
    expect(network.pipes[0].initialStatus).toBe("open");
    expect(network.pipes[0].year).toBeUndefined();
    expect(network.pipes[0].minorLoss).toBeUndefined();
    expect(
      issues.filter((issue) => issue.code === "invalidValue"),
    ).toHaveLength(4);
  });

  it("keeps valid negative demand injections and zero elevations", async () => {
    const { network } = await buildNetworkFromLayers(
      [
        points("junction", [point(0, 0, { q: -10, elevation: 0 })], {
          mapping: { demand: "q", elevation: "elevation" },
        }),
      ],
      options,
    );
    expect(network.junctions[0].demands?.[0].baseDemand).toBe(-10);
    expect(network.junctions[0].elevation).toBe(0);
  });

  it("optionally removes duplicate geometry and keeps the largest component", async () => {
    const { network, summary } = await buildNetworkFromLayers(
      [
        pipes([
          line([
            [0, 0],
            [10, 0],
          ]),
          line([
            [10, 0],
            [0, 0],
          ]),
          line([
            [10, 0],
            [20, 0],
          ]),
          line([
            [100, 0],
            [110, 0],
          ]),
        ]),
      ],
      { ...options, removeDuplicatePipes: true, keepLargestComponent: true },
    );
    expect(network.pipes).toHaveLength(2);
    expect(network.junctions).toHaveLength(3);
    expect(summary.duplicatePipesRemoved).toBe(1);
    expect(summary.components).toBe(1);
  });

  it("does not return a partial result after cancellation", async () => {
    const controller = new AbortController();
    const data = Array.from({ length: 300 }, (_, index) =>
      line([
        [index, 0],
        [index + 1, 0],
      ]),
    );
    await expect(
      buildNetworkFromLayers([pipes(data)], options, {
        signal: controller.signal,
        onProgress: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("matchesNetworkFilter", () => {
  it("uses inclusive ranges, including formatted numeric source values", () => {
    const feature = point(0, 0, { value: "1,000" });
    expect(
      matchesNetworkFilter(feature, {
        attribute: "value",
        operator: "greaterOrEquals",
        value: 1000,
      }),
    ).toBe(true);
    expect(
      matchesNetworkFilter(feature, {
        attribute: "value",
        operator: "lessOrEquals",
        value: 1000,
      }),
    ).toBe(true);
    expect(
      matchesNetworkFilter(feature, {
        attribute: "value",
        operator: "greaterThan",
        value: 1000,
      }),
    ).toBe(false);
    expect(
      matchesNetworkFilter(feature, {
        attribute: "missing",
        operator: "isEmpty",
      }),
    ).toBe(true);
  });
});

const position = (x: number, y: number, z?: number): Position =>
  z === undefined
    ? [125 + x / 110585, 6 + y / 111195]
    : [125 + x / 110585, 6 + y / 111195, z];
const line = (
  coordinates: number[][],
  properties: Record<string, unknown> = {},
): Feature<LineString> => ({
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: coordinates.map(([x, y, z]) => position(x, y, z)),
  },
  properties,
});
const point = (
  x: number,
  y: number,
  properties: Record<string, unknown> = {},
): Feature<Point> => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: position(x, y) },
  properties,
});
const pipes = (
  features: Feature[],
  config: Partial<NetworkLayer> = {},
): NetworkLayer => ({
  id: "pipes",
  name: "Water mains",
  role: "pipe",
  features,
  ...config,
});
const points = (
  role: NetworkLayer["role"],
  features: Feature[],
  config: Partial<NetworkLayer> = {},
): NetworkLayer => ({ id: role, name: role, role, features, ...config });
