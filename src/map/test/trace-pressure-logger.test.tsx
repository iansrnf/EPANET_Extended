import { waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { HydraulicModelBuilder } from "src/__helpers__/hydraulic-model-builder";
import { setInitialState } from "src/__helpers__/state";
import { PressureLogger } from "src/hydraulic-model/pressure-loggers";
import { fireMapClick, stubSnapping } from "./__helpers__/map-engine-mock";
import { renderMap } from "./__helpers__/map";
import { Mode } from "src/state/mode";
import { selectionAtom } from "src/state/selection";

describe("Tracing from a pressure logger", () => {
  it("can trace through a connected pipe", async () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(1, { coordinates: [0, 0] })
      .aJunction(2, { coordinates: [10, 0] })
      .aPipe(3, { startNodeId: 1, endNodeId: 2 })
      .build();

    const pressureLogger = new PressureLogger(4, [5, 0], {
      label: "L4",
    });
    hydraulicModel.pressureLoggers.set(pressureLogger.id, pressureLogger);

    const store = setInitialState({
      hydraulicModel,
      mode: Mode.BOUNDARY_TRACE_SELECT,
    });
    const map = await renderMap(store);

    stubSnapping(map, [3]);
    vi.mocked(map.pickOverlayObjects).mockReturnValue([
      {
        layer: { id: "pressure-loggers-layer" },
        object: pressureLogger,
      },
    ]);

    await fireMapClick(map, { lng: 5, lat: 0 });

    await waitFor(() => {
      expect(store.get(selectionAtom)).toEqual({
        type: "multi",
        ids: [1, 2, 3],
      });
    });
  });
});
