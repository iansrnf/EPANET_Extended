import { describe, expect, it } from "vitest";
import { HydraulicModelBuilder } from "src/__helpers__/hydraulic-model-builder";
import { PressureLogger } from "src/hydraulic-model/pressure-loggers";
import {
  alignSimulationValuesToLoggerPoints,
  buildLoggerPressurePoints,
  getConnectedPressureLoggerNodes,
} from "./pressure-logger-panel-utils";

describe("getConnectedPressureLoggerNodes", () => {
  it("returns visible node neighbors of a logger backing junction", () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(1, { label: "J1", coordinates: [0, 0] })
      .aJunction(2, { label: "L1-backing", coordinates: [10, 0] })
      .aTank(3, { label: "T1", coordinates: [10, 10] })
      .aPipe(10, { startNodeId: 1, endNodeId: 2 })
      .aPipe(11, { startNodeId: 2, endNodeId: 3 })
      .build();
    hydraulicModel.assets.get(2)?.setProperty("visibility", false);

    const pressureLogger = new PressureLogger(100, [10, 0], {
      label: "L1",
      connection: { junctionId: 2 },
    });

    hydraulicModel.pressureLoggers.set(pressureLogger.id, pressureLogger);

    expect(
      getConnectedPressureLoggerNodes(hydraulicModel, pressureLogger),
    ).toEqual([
      { id: 1, label: "J1", assetType: "junction" },
      { id: 3, label: "T1", assetType: "tank" },
    ]);
  });

  it("returns the connected node when the logger is attached directly to a visible simulation node", () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(1, { label: "J103", coordinates: [0, 0] })
      .build();

    const pressureLogger = new PressureLogger(100, [0, 0], {
      label: "L1",
      connection: { junctionId: 1 },
    });

    hydraulicModel.pressureLoggers.set(pressureLogger.id, pressureLogger);

    expect(
      getConnectedPressureLoggerNodes(hydraulicModel, pressureLogger),
    ).toEqual([{ id: 1, label: "J103", assetType: "junction" }]);
  });

  it("returns visible neighbors of a logger-owned helper junction even without logger connection metadata", () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(1, { label: "J103", coordinates: [0, 0] })
      .aJunction(2, { label: "L1-helper", coordinates: [10, 0] })
      .aPipe(10, { startNodeId: 1, endNodeId: 2 })
      .build();
    hydraulicModel.assets.get(2)?.setProperty("visibility", false);
    hydraulicModel.assets.get(2)?.setProperty("pressureLoggerId", 100);

    const pressureLogger = new PressureLogger(100, [10, 0], {
      label: "L1",
    });

    hydraulicModel.pressureLoggers.set(pressureLogger.id, pressureLogger);

    expect(
      getConnectedPressureLoggerNodes(hydraulicModel, pressureLogger),
    ).toEqual([{ id: 1, label: "J103", assetType: "junction" }]);
  });

  it("returns visible neighbors of a hidden helper junction at the logger coordinates", () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(1, { label: "J103", coordinates: [0, 0] })
      .aJunction(2, { label: "L1-helper", coordinates: [10, 20] })
      .aPipe(10, { startNodeId: 2, endNodeId: 1 })
      .build();
    hydraulicModel.assets.get(2)?.setProperty("visibility", false);

    const pressureLogger = new PressureLogger(100, [10, 20], {
      label: "L1",
    });

    hydraulicModel.pressureLoggers.set(pressureLogger.id, pressureLogger);

    expect(
      getConnectedPressureLoggerNodes(hydraulicModel, pressureLogger),
    ).toEqual([{ id: 1, label: "J103", assetType: "junction" }]);
  });

  it("matches logger-owned helper junctions by logger label", () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(1, { label: "J103", coordinates: [0, 0] })
      .aJunction(2, { label: "L1-helper", coordinates: [10, 20] })
      .aPipe(10, { startNodeId: 2, endNodeId: 1 })
      .build();
    hydraulicModel.assets.get(2)?.setProperty("visibility", false);
    hydraulicModel.assets.get(2)?.setProperty("pressureLoggerId", "L1");

    const pressureLogger = new PressureLogger(100, [10, 20], {
      label: "L1",
    });

    hydraulicModel.pressureLoggers.set(pressureLogger.id, pressureLogger);

    expect(
      getConnectedPressureLoggerNodes(hydraulicModel, pressureLogger),
    ).toEqual([{ id: 1, label: "J103", assetType: "junction" }]);
  });

  it("uses a nearby hidden helper junction when imported logger metadata is missing", () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(1, { label: "J103", coordinates: [0, 0] })
      .aJunction(2, { label: "L1-helper", coordinates: [10.00001, 20.00001] })
      .aPipe(10, { startNodeId: 2, endNodeId: 1 })
      .build();
    hydraulicModel.assets.get(2)?.setProperty("visibility", false);

    const pressureLogger = new PressureLogger(100, [10, 20], {
      label: "L1",
    });

    hydraulicModel.pressureLoggers.set(pressureLogger.id, pressureLogger);

    expect(
      getConnectedPressureLoggerNodes(hydraulicModel, pressureLogger),
    ).toEqual([{ id: 1, label: "J103", assetType: "junction" }]);
  });

  it("returns junctions connected to the logger point through a pipe endpoint", () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(1, { label: "L1-helper", coordinates: [10, 20] })
      .aJunction(2, { label: "J103", coordinates: [0, 0] })
      .aPipe(10, { startNodeId: 1, endNodeId: 2 })
      .build();
    hydraulicModel.assets.get(1)?.setProperty("visibility", false);

    const pipe = hydraulicModel.assets.get(10);
    if (pipe?.isLink) {
      pipe.setCoordinates([
        [10, 20],
        [0, 0],
      ]);
    }

    const pressureLogger = new PressureLogger(100, [10, 20], {
      label: "L1",
    });

    hydraulicModel.pressureLoggers.set(pressureLogger.id, pressureLogger);

    expect(
      getConnectedPressureLoggerNodes(hydraulicModel, pressureLogger),
    ).toEqual([{ id: 2, label: "J103", assetType: "junction" }]);
  });

  it("uses a pipe endpoint node with the logger label as the connection anchor", () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(1, { label: "J103", coordinates: [0, 0] })
      .aJunction(2, { label: "L1", coordinates: [10, 20] })
      .aPipe(155, { startNodeId: 1, endNodeId: 2 })
      .build();

    const pressureLogger = new PressureLogger(100, [10, 20], {
      label: "L1",
    });

    hydraulicModel.pressureLoggers.set(pressureLogger.id, pressureLogger);

    expect(
      getConnectedPressureLoggerNodes(hydraulicModel, pressureLogger),
    ).toEqual([{ id: 1, label: "J103", assetType: "junction" }]);
  });

  it("uses nearby pipe geometry as the connection reference when the logger is not on an endpoint", () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(1, { label: "J103", coordinates: [0, 0] })
      .aJunction(2, { label: "L1", coordinates: [0.001, 0] })
      .aPipe(155, { startNodeId: 1, endNodeId: 2 })
      .build();

    const pipe = hydraulicModel.assets.get(155);
    if (pipe?.isLink) {
      pipe.setCoordinates([
        [0, 0],
        [0.001, 0],
      ]);
    }

    const pressureLogger = new PressureLogger(100, [0.0005, 0.00005], {
      label: "L1",
    });

    hydraulicModel.pressureLoggers.set(pressureLogger.id, pressureLogger);

    expect(
      getConnectedPressureLoggerNodes(hydraulicModel, pressureLogger),
    ).toEqual([{ id: 1, label: "J103", assetType: "junction" }]);
  });

  it("returns an empty list when the logger is not connected", () => {
    const hydraulicModel = HydraulicModelBuilder.with().build();
    const pressureLogger = new PressureLogger(100, [10, 0], {
      label: "L1",
    });

    expect(
      getConnectedPressureLoggerNodes(hydraulicModel, pressureLogger),
    ).toEqual([]);
  });

  it("keeps logger readings at per-point timestamp resolution", () => {
    expect(
      buildLoggerPressurePoints([
        {
          deviceId: "L1",
          psi: 10,
          timestamp: "2026-03-17T01:00:00.000Z",
        },
        {
          deviceId: "L1",
          psi: 14,
          timestamp: "2026-03-17T01:00:01.000Z",
        },
        {
          deviceId: "L1",
          psi: 20,
          timestamp: "2026-03-17T01:00:30.000Z",
        },
      ]),
    ).toEqual([
      { x: 0, y: 10 },
      { x: 1, y: 14 },
      { x: 30, y: 20 },
    ]);
  });

  it("repeats simulated interval values across logger points", () => {
    expect(
      alignSimulationValuesToLoggerPoints(
        [
          { x: 0, y: 9 },
          { x: 1, y: 10 },
          { x: 30, y: 11 },
          { x: 3599, y: 12 },
          { x: 3600, y: 13 },
          { x: 3601, y: 14 },
        ],
        [12, 18],
        3600,
      ),
    ).toEqual([
      { x: 0, y: 12 },
      { x: 1, y: 12 },
      { x: 30, y: 12 },
      { x: 3599, y: 12 },
      { x: 3600, y: 18 },
      { x: 3601, y: 18 },
    ]);
  });
});
