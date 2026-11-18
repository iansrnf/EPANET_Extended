import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import type { Point } from "geojson";
import { buildAssetHoverSource } from "./asset-hover";

describe("buildAssetHoverSource", () => {
  it("clears absent and deleted hover targets", () => {
    const IDS = { J1: 1, MISSING: 2 } as const;
    const { assets } = HydraulicModelBuilder.with().aJunction(IDS.J1).build();

    expect(buildAssetHoverSource(null, assets)).toEqual([]);
    expect(buildAssetHoverSource(IDS.MISSING, assets)).toEqual([]);
  });

  it("excludes hidden assets", () => {
    const IDS = { J1: 1 } as const;
    const { assets } = HydraulicModelBuilder.with().aJunction(IDS.J1).build();
    assets.get(IDS.J1)!.setProperty("visibility", false);

    expect(buildAssetHoverSource(IDS.J1, assets)).toEqual([]);
  });

  const NODE_IDS = { J1: 1, R1: 2, T1: 3 } as const;

  it.each([
    ["junction", NODE_IDS.J1, [1, 2]],
    ["reservoir", NODE_IDS.R1, [3, 4]],
    ["tank", NODE_IDS.T1, [5, 6]],
  ] as const)(
    "places the %s ring at its coordinates",
    (type, id, coordinates) => {
      const { assets } = HydraulicModelBuilder.with()
        .aJunction(NODE_IDS.J1, { coordinates: [1, 2] })
        .aReservoir(NODE_IDS.R1, { coordinates: [3, 4] })
        .aTank(NODE_IDS.T1, { coordinates: [5, 6] })
        .build();

      expect(buildAssetHoverSource(id, assets)).toEqual([
        {
          type: "Feature",
          id,
          properties: { type, isActive: true },
          geometry: { type: "Point", coordinates },
        },
      ]);
    },
  );

  it("keeps every pipe bend while excluding nearby assets", () => {
    const IDS = { J1: 1, J2: 2, P1: 3 } as const;
    const coordinates = [
      [0, 0],
      [0, 1],
      [2, 1],
    ];
    const { assets } = HydraulicModelBuilder.with()
      .aJunction(IDS.J1, { coordinates: [0, 0] })
      .aJunction(IDS.J2, { coordinates: [2, 1] })
      .aPipe(IDS.P1, {
        startNodeId: IDS.J1,
        endNodeId: IDS.J2,
        coordinates,
      })
      .build();

    expect(buildAssetHoverSource(IDS.P1, assets)).toEqual([
      {
        type: "Feature",
        id: IDS.P1,
        properties: { type: "pipe", isActive: true },
        geometry: { type: "LineString", coordinates },
      },
    ]);
  });

  const LINK_IDS = { J1: 1, J2: 2, PU1: 3, V1: 4 } as const;

  it.each([
    ["pump", LINK_IDS.PU1],
    ["valve", LINK_IDS.V1],
  ] as const)("aligns the %s icon ring with the link midpoint", (type, id) => {
    const coordinates = [
      [0, 0],
      [0, 0.001],
      [0.002, 0.001],
    ];
    const { assets } = HydraulicModelBuilder.with()
      .aJunction(LINK_IDS.J1, { coordinates: [0, 0] })
      .aJunction(LINK_IDS.J2, { coordinates: [0.002, 0.001] })
      .aPump(LINK_IDS.PU1, {
        startNodeId: LINK_IDS.J1,
        endNodeId: LINK_IDS.J2,
        coordinates,
      })
      .aValve(LINK_IDS.V1, {
        startNodeId: LINK_IDS.J1,
        endNodeId: LINK_IDS.J2,
        coordinates,
      })
      .build();

    const features = buildAssetHoverSource(id, assets);
    expect(features).toHaveLength(2);
    expect(features[0].geometry).toEqual({ type: "LineString", coordinates });
    expect(features[1].properties?.type).toEqual(type);
    const point = features[1].geometry as Point;
    expect(point.type).toEqual("Point");
    expect(point.coordinates[0]).toBeCloseTo(0.0005, 7);
    expect(point.coordinates[1]).toBeCloseTo(0.001, 7);
  });

  it("keeps inactive assets hoverable", () => {
    const IDS = { J1: 1 } as const;
    const { assets } = HydraulicModelBuilder.with()
      .aJunction(IDS.J1, { isActive: false })
      .build();

    expect(buildAssetHoverSource(IDS.J1, assets)[0].properties?.isActive).toBe(
      false,
    );
  });
});
