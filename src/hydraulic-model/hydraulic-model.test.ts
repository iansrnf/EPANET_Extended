import { describe, expect, it } from "vitest";
import {
  applyChangeSet,
  changeCurves,
  changeDemandAssignment,
  changePatterns,
  changeZones,
} from "@epanet-js/hydraulic-model-operations";
import {
  buildTestFactories,
  buildZone,
  HydraulicModelBuilder,
} from "@epanet-js/hydraulic-model-testing";
import { copyModel } from "./hydraulic-model";

const IDS = { J1: 1, CP1: 2, C1: 3, PAT1: 4, Z1: 5 } as const;

describe("copyModel", () => {
  it("keeps branch collection edits out of the source model", () => {
    const factories = buildTestFactories();
    const zoneData = {
      id: IDS.Z1,
      label: "Zone",
      geometry: {
        type: "MultiPolygon" as const,
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        ],
      },
      bbox: [0, 0, 1, 1] as [number, number, number, number],
    };
    const source = HydraulicModelBuilder.with(factories)
      .aJunction(IDS.J1)
      .aCustomerPoint(IDS.CP1)
      .aJunctionDemand(IDS.J1, [{ baseDemand: 1 }])
      .aCustomerPointDemand(IDS.CP1, [{ baseDemand: 2 }])
      .aPumpCurve({ id: IDS.C1, points: [{ x: 1, y: 2 }] })
      .aDemandPattern(IDS.PAT1, "Pattern", [1])
      .aZone(zoneData)
      .build();
    const branch = copyModel(source);
    const labels = factories.labelManager.copy();
    const curve = source.curves.get(IDS.C1)!;
    const pattern = source.patterns.get(IDS.PAT1)!;
    const zone = source.zones.get(IDS.Z1)!;
    const curves = new Map(branch.curves);
    curves.set(IDS.C1, { ...curve, points: [{ x: 1, y: 3 }] });
    const patterns = new Map(branch.patterns);
    patterns.set(IDS.PAT1, { ...pattern, multipliers: [2] });
    const zones = new Map(branch.zones);
    zones.set(IDS.Z1, buildZone({ ...zoneData, label: "Branch" }));

    for (const change of [
      changeCurves(branch, { curves }),
      changePatterns(branch, patterns),
      changeZones(branch, { zones }),
      changeDemandAssignment(branch, [
        { junctionId: IDS.J1, demands: [{ baseDemand: 3 }] },
        { customerPointId: IDS.CP1, demands: [{ baseDemand: 4 }] },
      ]),
    ]) {
      applyChangeSet(branch, change, "forward", labels);
    }

    expect(branch.curves.get(IDS.C1)?.points).toEqual([{ x: 1, y: 3 }]);
    expect(branch.patterns.get(IDS.PAT1)?.multipliers).toEqual([2]);
    expect(branch.zones.get(IDS.Z1)?.label).toBe("Branch");
    expect(branch.demands.junctions.get(IDS.J1)).toEqual([{ baseDemand: 3 }]);
    expect(branch.demands.customerPoints.get(IDS.CP1)).toEqual([
      { baseDemand: 4 },
    ]);
    expect(source.curves.get(IDS.C1)).toBe(curve);
    expect(source.patterns.get(IDS.PAT1)).toBe(pattern);
    expect(source.zones.get(IDS.Z1)).toBe(zone);
    expect(source.demands.junctions.get(IDS.J1)).toEqual([{ baseDemand: 1 }]);
    expect(source.demands.customerPoints.get(IDS.CP1)).toEqual([
      { baseDemand: 2 },
    ]);
  });
});
