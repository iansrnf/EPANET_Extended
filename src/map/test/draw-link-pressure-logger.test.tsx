import { waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { PressureLogger } from "src/hydraulic-model/pressure-loggers";
import { setInitialState } from "src/__helpers__/state";
import { Mode } from "src/state/mode";
import { renderMap } from "./__helpers__/map";
import {
  fireDoubleClick,
  fireMapClick,
  fireMapMove,
  getSourceFeatures,
} from "./__helpers__/map-engine-mock";
import { stubElevation } from "./__helpers__/elevations";
import { stagingModelAtom } from "src/state/hydraulic-model";

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
        (asset) => asset.type === "pipe",
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
});
