import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import type { Logger } from "@epanet-js/project-settings";
import {
  isLoggerLabelAvailable,
  nextLoggerLabel,
  resolveLoggerConnection,
  transformLoggersCoordinates,
} from "./loggers";

describe("loggers", () => {
  it("reprojects logger positions and their connections without changing the source", () => {
    const IDS = { L1: "1", L2: "2", P1: 3 } as const;
    const loggers: Logger[] = [
      {
        id: IDS.L1,
        label: "Logger 1",
        coordinates: [1, 2],
        connection: { assetId: IDS.P1, snapPoint: [3, 4] },
      },
      { id: IDS.L2, label: "Logger 2", coordinates: [5, 6], connection: null },
    ];

    const transformed = transformLoggersCoordinates(loggers, ([x, y]) => [
      x + 10,
      y * 2,
    ]);

    expect(transformed).toEqual([
      {
        ...loggers[0],
        coordinates: [11, 4],
        connection: { assetId: IDS.P1, snapPoint: [13, 8] },
      },
      { ...loggers[1], coordinates: [15, 12] },
    ]);
    expect(loggers[0].coordinates).toEqual([1, 2]);
    expect(loggers[0].connection?.snapPoint).toEqual([3, 4]);
    expect(
      transformLoggersCoordinates(undefined, (coordinates) => coordinates),
    ).toBeUndefined();
  });

  it("allocates an unused label and rejects duplicate renames", () => {
    const IDS = { L1: "1", L2: "2", L3: "3" } as const;
    const loggers: Logger[] = [
      { id: IDS.L1, label: "Logger 1", coordinates: [0, 0], connection: null },
      { id: IDS.L2, label: "logger 3", coordinates: [1, 0], connection: null },
    ];
    expect(nextLoggerLabel(loggers, "Logger")).toBe("Logger 2");
    expect(isLoggerLabelAvailable(loggers, IDS.L1, " Logger 1 ")).toBe(true);
    expect(isLoggerLabelAvailable(loggers, IDS.L3, " LOGGER 1 ")).toBe(false);
    expect(isLoggerLabelAvailable(loggers, IDS.L1, "  ")).toBe(false);
    expect(isLoggerLabelAvailable(loggers, IDS.L1, "L".repeat(51))).toBe(false);
  });

  it("accepts pipe and node targets while resolving a node's current coordinates", () => {
    const IDS = {
      J1: 1,
      J2: 2,
      P1: 3,
      R1: 4,
      T1: 5,
      Pump: 6,
      Missing: 7,
    } as const;
    const model = HydraulicModelBuilder.with()
      .aJunction(IDS.J1, { coordinates: [0, 0] })
      .aJunction(IDS.J2, { coordinates: [10, 0] })
      .aPipe(IDS.P1, { startNodeId: IDS.J1, endNodeId: IDS.J2 })
      .aReservoir(IDS.R1, { coordinates: [20, 0] })
      .aTank(IDS.T1, { coordinates: [30, 0] })
      .aPump(IDS.Pump, { startNodeId: IDS.J1, endNodeId: IDS.J2 })
      .build();

    expect(
      resolveLoggerConnection(model.assets, {
        assetId: IDS.P1,
        snapPoint: [5, 0],
      }),
    ).toEqual({ assetId: IDS.P1, snapPoint: [5, 0] });
    for (const [assetId, coordinates] of [
      [IDS.J1, [0, 0]],
      [IDS.R1, [20, 0]],
      [IDS.T1, [30, 0]],
    ] as const) {
      expect(
        resolveLoggerConnection(model.assets, {
          assetId,
          snapPoint: [100, 100],
        }),
      ).toEqual({ assetId, snapPoint: coordinates });
    }
    expect(
      resolveLoggerConnection(model.assets, {
        assetId: IDS.Pump,
        snapPoint: [5, 0],
      }),
    ).toBeNull();
    expect(
      resolveLoggerConnection(model.assets, {
        assetId: IDS.Missing,
        snapPoint: [5, 0],
      }),
    ).toBeNull();
  });
});
