import { describe, it, expect } from "vitest";
import { moveNode } from "./move-node";

import { NodeAsset, LinkAsset } from "../asset-types";
import { HydraulicModelBuilder } from "../../__helpers__/hydraulic-model-builder";
import { buildTestFactories } from "src/__helpers__/test-factories";

describe("moveNode", () => {
  it("updates the coordinates of a node", () => {
    const IDS = { A: 1 };
    const { assetFactory, labelManager } = buildTestFactories();
    const hydraulicModel = HydraulicModelBuilder.with({
      assetFactory,
      labelManager,
    })
      .aNode(IDS.A, [10, 10])
      .build();

    const newCoordinates = [20, 20];
    const newElevation = 10;

    const { putAssets } = moveNode(hydraulicModel, {
      assetFactory,
      labelManager,
      lengthUnit: "m",
      nodeId: IDS.A,
      newCoordinates,
      newElevation,
    });

    expect(putAssets).toHaveLength(1);
    const [node] = putAssets!;
    expect(node.type).toBe("junction");
    expect(node.coordinates).toEqual(newCoordinates);
    expect((node as NodeAsset).elevation).toBe(newElevation);
  });

  it("updates the connected links", () => {
    const IDS = { A: 1, B: 2, C: 3, AB: 4, BC: 5 };
    const { assetFactory, labelManager } = buildTestFactories();
    const hydraulicModel = HydraulicModelBuilder.with({
      assetFactory,
      labelManager,
    })
      .aNode(IDS.A, [10, 10])
      .aNode(IDS.B, [20, 20])
      .aNode(IDS.C, [30, 30])
      .aLink(IDS.AB, IDS.A, IDS.B, { length: 1 })
      .aLink(IDS.BC, IDS.B, IDS.C, { length: 2 })
      .build();

    const newCoordinates = [25, 25];
    const anyElevation = 10;

    const { putAssets } = moveNode(hydraulicModel, {
      assetFactory,
      labelManager,
      lengthUnit: "m",
      nodeId: IDS.B,
      newCoordinates,
      newElevation: anyElevation,
    });

    expect(putAssets).toHaveLength(3);
    const movedNode = putAssets![0] as NodeAsset;
    const linkAB = putAssets![1] as LinkAsset;
    const linkBC = putAssets![2] as LinkAsset;

    expect(movedNode.coordinates).toEqual(newCoordinates);
    expect(linkAB.coordinates).toEqual([[10, 10], newCoordinates]);
    expect(linkBC.coordinates).toEqual([newCoordinates, [30, 30]]);
  });

  describe("customer points", () => {
    it("updates customer point snap points when updateCustomerPoints is true", () => {
      const IDS = { J1: 1, J2: 2, P1: 3, CP1: 4 };
      const { assetFactory, labelManager } = buildTestFactories();
      const hydraulicModel = HydraulicModelBuilder.with({
        assetFactory,
        labelManager,
      })
        .aNode(IDS.J1, [10, 10])
        .aNode(IDS.J2, [30, 10])
        .aPipe(IDS.P1, {
          startNodeId: IDS.J1,
          endNodeId: IDS.J2,
          coordinates: [
            [10, 10],
            [30, 10],
          ],
        })
        .aCustomerPoint(IDS.CP1, {
          coordinates: [15, 15],
          connection: {
            pipeId: IDS.P1,
            snapPoint: [15, 10],
            junctionId: IDS.J1,
          },
        })
        .build();

      const newCoordinates = [10, 20];
      const { putAssets, putCustomerPoints } = moveNode(hydraulicModel, {
        assetFactory,
        labelManager,
        lengthUnit: "m",
        nodeId: IDS.J1,
        newCoordinates,
        newElevation: 0,
        shouldUpdateCustomerPoints: true,
      });

      expect(putAssets).toHaveLength(2);
      expect(putCustomerPoints).toHaveLength(1);
      expect(putCustomerPoints![0].connection?.snapPoint).not.toEqual([15, 10]);
    });

    it("does not update customer points when updateCustomerPoints is false", () => {
      const IDS = { J1: 1, J2: 2, P1: 3, CP1: 4 };
      const { assetFactory, labelManager } = buildTestFactories();
      const hydraulicModel = HydraulicModelBuilder.with({
        assetFactory,
        labelManager,
      })
        .aNode(IDS.J1, [10, 10])
        .aNode(IDS.J2, [30, 10])
        .aPipe(IDS.P1, {
          startNodeId: IDS.J1,
          endNodeId: IDS.J2,
          coordinates: [
            [10, 10],
            [30, 10],
          ],
        })
        .aCustomerPoint(IDS.CP1, {
          coordinates: [15, 15],
          connection: {
            pipeId: IDS.P1,
            snapPoint: [15, 10],
            junctionId: IDS.J1,
          },
        })
        .build();

      const { putCustomerPoints } = moveNode(hydraulicModel, {
        assetFactory,
        labelManager,
        lengthUnit: "m",
        nodeId: IDS.J1,
        newCoordinates: [10, 20],
        newElevation: 0,
      });

      expect(putCustomerPoints).toBeUndefined();
    });

    it("skips customer points when none are connected to affected pipes", () => {
      const IDS = { J1: 1, J2: 2, P1: 3 };
      const { assetFactory, labelManager } = buildTestFactories();
      const hydraulicModel = HydraulicModelBuilder.with({
        assetFactory,
        labelManager,
      })
        .aNode(IDS.J1, [10, 10])
        .aNode(IDS.J2, [30, 10])
        .aPipe(IDS.P1, {
          startNodeId: IDS.J1,
          endNodeId: IDS.J2,
        })
        .build();

      const { putCustomerPoints } = moveNode(hydraulicModel, {
        assetFactory,
        labelManager,
        lengthUnit: "m",
        nodeId: IDS.J1,
        newCoordinates: [15, 20],
        newElevation: 0,
        shouldUpdateCustomerPoints: true,
      });

      expect(putCustomerPoints).toBeUndefined();
    });

    it("reallocates customer point to new junction when node move changes closest endpoint", () => {
      const IDS = { J1: 1, J2: 2, P1: 3, CP1: 4 };
      const { assetFactory, labelManager } = buildTestFactories();
      const hydraulicModel = HydraulicModelBuilder.with({
        assetFactory,
        labelManager,
      })
        .aJunction(IDS.J1, { coordinates: [0, 0] })
        .aJunction(IDS.J2, { coordinates: [20, 0] })
        .aPipe(IDS.P1, {
          startNodeId: IDS.J1,
          endNodeId: IDS.J2,
        })
        .aCustomerPoint(IDS.CP1, {
          coordinates: [4, 4],
          connection: {
            pipeId: IDS.P1,
            snapPoint: [4, 0],
            junctionId: IDS.J1,
          },
        })
        .build();

      const { putCustomerPoints } = moveNode(hydraulicModel, {
        assetFactory,
        labelManager,
        lengthUnit: "m",
        nodeId: IDS.J1,
        newCoordinates: [25, 0],
        newElevation: 0,
        shouldUpdateCustomerPoints: true,
      });

      expect(putCustomerPoints).toHaveLength(1);
      expect(putCustomerPoints![0].connection?.junctionId).toBe(IDS.J2);
    });

    it("updates junction assignments when customer point stays with same junction", () => {
      const IDS = { J1: 1, J2: 2, P1: 3, CP1: 4 };
      const { assetFactory, labelManager } = buildTestFactories();
      const hydraulicModel = HydraulicModelBuilder.with({
        assetFactory,
        labelManager,
      })
        .aJunction(IDS.J1, { coordinates: [0, 0] })
        .aJunction(IDS.J2, { coordinates: [20, 0] })
        .aPipe(IDS.P1, {
          startNodeId: IDS.J1,
          endNodeId: IDS.J2,
        })
        .aCustomerPoint(IDS.CP1, {
          coordinates: [4, 4],
          connection: {
            pipeId: IDS.P1,
            snapPoint: [4, 0],
            junctionId: IDS.J1,
          },
        })
        .build();

      const { putCustomerPoints } = moveNode(hydraulicModel, {
        assetFactory,
        labelManager,
        lengthUnit: "m",
        nodeId: IDS.J1,
        newCoordinates: [0, 5],
        newElevation: 0,
        shouldUpdateCustomerPoints: true,
      });

      expect(putCustomerPoints).toHaveLength(1);
      expect(putCustomerPoints![0].connection?.junctionId).toBe(IDS.J1);
    });
  });

  it("splits pipe and connects moved node when pipeIdToSplit provided", () => {
    const IDS = { J1: 1, J2: 2, J3: 3, P1: 4 };
    const { assetFactory, labelManager } = buildTestFactories();
    const hydraulicModel = HydraulicModelBuilder.with({
      assetFactory,
      labelManager,
    })
      .aNode(IDS.J1, [0, 0])
      .aNode(IDS.J2, [10, 0])
      .aNode(IDS.J3, [0, 10])
      .aPipe(IDS.P1, { startNodeId: IDS.J1, endNodeId: IDS.J2 })
      .build();

    const { putAssets, deleteAssets } = moveNode(hydraulicModel, {
      assetFactory,
      labelManager,
      lengthUnit: "m",
      nodeId: IDS.J3,
      newCoordinates: [5, 0],
      newElevation: 0,
      pipeIdToSplit: IDS.P1,
    });

    expect(deleteAssets).toEqual([IDS.P1]);
    expect(putAssets).toHaveLength(3);
  });

  it("throws error for invalid pipeIdToSplit", () => {
    const IDS = { J1: 1 };
    const { assetFactory, labelManager } = buildTestFactories();
    const hydraulicModel = HydraulicModelBuilder.with({
      assetFactory,
      labelManager,
    })
      .aNode(IDS.J1, [0, 0])
      .build();

    expect(() =>
      moveNode(hydraulicModel, {
        assetFactory,
        labelManager,
        lengthUnit: "m",
        nodeId: IDS.J1,
        newCoordinates: [5, 0],
        newElevation: 0,
        pipeIdToSplit: 999,
      }),
    ).toThrow("Invalid pipe ID: 999");
  });

  it("removes matching vertex when moving node to vertex location", () => {
    const IDS = { J1: 1, J2: 2, J3: 3, P1: 4 };
    const { assetFactory, labelManager } = buildTestFactories();
    const hydraulicModel = HydraulicModelBuilder.with({
      assetFactory,
      labelManager,
    })
      .aNode(IDS.J1, [0, 0])
      .aNode(IDS.J2, [10, 0])
      .aNode(IDS.J3, [0, 10])
      .aPipe(IDS.P1, {
        startNodeId: IDS.J1,
        endNodeId: IDS.J2,
        coordinates: [
          [0, 0],
          [5, 0],
          [10, 0],
        ],
      })
      .build();

    const { putAssets } = moveNode(hydraulicModel, {
      assetFactory,
      labelManager,
      lengthUnit: "m",
      nodeId: IDS.J3,
      newCoordinates: [5, 0],
      newElevation: 0,
      pipeIdToSplit: IDS.P1,
    });

    const pipes = putAssets!.filter((asset) => asset.type === "pipe");
    expect(pipes).toHaveLength(2);
  });
});
