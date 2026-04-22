import { waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { HydraulicModelBuilder } from "src/__helpers__/hydraulic-model-builder";
import { Asset, LinkAsset } from "src/hydraulic-model";
import { PressureLogger } from "src/hydraulic-model/pressure-loggers";
import { setInitialState } from "src/__helpers__/state";
import { Mode } from "src/state/mode";
import { renderMap } from "./__helpers__/map";
import {
  fireDoubleClick,
  fireMapClick,
  fireMapMove,
  getSourceFeatures,
  stubSnappingOnce,
} from "./__helpers__/map-engine-mock";
import { stubElevation } from "./__helpers__/elevations";
import { stagingModelAtom } from "src/state/hydraulic-model";
import { buildFeatureId } from "../data-source/features";

describe("Drawing a pipe from a pressure logger", () => {
  it("creates a pipe endpoint at the logger location", async () => {
    const loggerPoint = { lng: 10, lat: 20 };
    const endPoint = { lng: 30, lat: 40 };

    stubElevation(loggerPoint, 125);
    const store = setInitialState({ mode: Mode.DRAW_PIPE });
    const map = await renderMap(store);

    const pressureLogger = new PressureLogger(1, [10, 20], {
      label: "L1",
    });
    store
      .get(stagingModelAtom)
      .pressureLoggers.set(pressureLogger.id, pressureLogger);

    vi.mocked(map.pickOverlayObjects)
      .mockReturnValueOnce([
        {
          layer: { id: "pressure-loggers-layer" },
          object: pressureLogger,
        },
      ])
      .mockReturnValue([]);

    await fireMapClick(map, loggerPoint);

    await waitFor(() => {
      expect(getSourceFeatures(map, "ephemeral")).toEqual([
        expect.objectContaining({
          geometry: expect.objectContaining({
            type: "Point",
            coordinates: [10, 20],
          }),
        }),
        expect.objectContaining({
          geometry: expect.objectContaining({
            type: "LineString",
            coordinates: [
              [10, 20],
              [10, 20],
            ],
          }),
        }),
      ]);
    });

    await fireMapMove(map, endPoint);
    await fireDoubleClick(map, endPoint);

    await waitFor(() => {
      const { assets, pressureLoggers } = store.get(stagingModelAtom);
      const pipes = Array.from(assets.values()).filter(
        (asset): asset is LinkAsset => asset.type === "pipe",
      );
      const junctions = Array.from(assets.values()).filter(
        (asset) => asset.type === "junction",
      );
      const updatedPressureLogger = pressureLoggers.get(pressureLogger.id);

      expect(pipes).toHaveLength(1);
      expect(junctions).toHaveLength(2);
      expect(updatedPressureLogger?.connection?.junctionId).toBeDefined();
      expect(
        junctions.some(
          (junction) =>
            junction.id === updatedPressureLogger?.connection?.junctionId &&
            junction.feature.properties.visibility === false,
        ),
      ).toBe(true);

      expect(pipes[0].coordinates).toEqual([
        [10, 20],
        [30, 40],
      ]);
    });
  });

  it("connects the logger to an existing node through a hidden helper junction", async () => {
    const IDS = { J1: 10 } as const;
    const loggerPoint = { lng: 10, lat: 20 };
    const existingNodeCoords = [30, 40];
    const nearbyEndClick = { lng: 30.001, lat: 40.001 };

    stubElevation(loggerPoint, 125);
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(IDS.J1, {
        coordinates: existingNodeCoords,
        elevation: 130,
      })
      .build();
    const junction = hydraulicModel.assets.get(IDS.J1) as Asset;

    const store = setInitialState({
      mode: Mode.DRAW_PIPE,
      hydraulicModel,
    });
    const map = await renderMap(store);

    const pressureLogger = new PressureLogger(1, [10, 20], {
      label: "L1",
    });
    store
      .get(stagingModelAtom)
      .pressureLoggers.set(pressureLogger.id, pressureLogger);

    vi.mocked(map.pickOverlayObjects)
      .mockReturnValueOnce([
        {
          layer: { id: "pressure-loggers-layer" },
          object: pressureLogger,
        },
      ])
      .mockReturnValue([]);

    await fireMapClick(map, loggerPoint);
    await fireMapMove(map, nearbyEndClick);
    stubSnappingOnce(map, [buildFeatureId(junction.id)]);
    await fireMapClick(map, nearbyEndClick);

    await waitFor(() => {
      const { assets, pressureLoggers } = store.get(stagingModelAtom);
      const pipes = Array.from(assets.values()).filter(
        (asset): asset is LinkAsset => asset.type === "pipe",
      );
      const junctions = Array.from(assets.values()).filter(
        (asset) => asset.type === "junction",
      );
      const updatedPressureLogger = pressureLoggers.get(pressureLogger.id);
      const hiddenHelperJunction = junctions.find(
        (junction) =>
          junction.id === updatedPressureLogger?.connection?.junctionId,
      );

      expect(pipes).toHaveLength(1);
      expect(junctions).toHaveLength(2);
      expect(updatedPressureLogger?.connection?.junctionId).not.toBe(IDS.J1);
      expect(hiddenHelperJunction?.feature.properties.visibility).toBe(false);
      expect(hiddenHelperJunction?.getProperty("pressureLoggerId")).toBe(
        pressureLogger.id,
      );
      expect(pipes[0].connections).toEqual([hiddenHelperJunction!.id, IDS.J1]);
      expect(getSourceFeatures(map, "ephemeral")).toHaveLength(0);
    });
  });
});
