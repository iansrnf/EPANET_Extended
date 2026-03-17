import { fireMapClick, getSourceFeatures } from "./__helpers__/map-engine-mock";
import { stubElevation } from "./__helpers__/elevations";
import { setInitialState } from "src/__helpers__/state";
import { Mode } from "src/state/mode";
import { renderMap } from "./__helpers__/map";
import { stagingModelAtom } from "src/state/hydraulic-model";
import { selectionAtom } from "src/state/selection";
import { waitFor } from "@testing-library/react";

describe("Drawing a pressure logger", () => {
  it("draws its own pressure logger instead of creating a customer point", async () => {
    const clickPoint = { lng: 10, lat: 20 };
    stubElevation(clickPoint, 125);
    const store = setInitialState({ mode: Mode.DRAW_PRESSURE_LOGGER });
    const map = await renderMap(store);

    await fireMapClick(map, clickPoint);

    await waitFor(() => {
      const features = getSourceFeatures(map, "delta-features");
      expect(features).toHaveLength(0);
    });

    const { assets, customerPoints, pressureLoggers } =
      store.get(stagingModelAtom);

    expect(assets.size).toBe(0);
    expect(customerPoints.size).toBe(0);
    expect(pressureLoggers.size).toBe(1);

    const pressureLogger = Array.from(pressureLoggers.values())[0];
    expect(pressureLogger.coordinates).toEqual([10, 20]);

    await waitFor(() => {
      const selection = store.get(selectionAtom);
      expect(selection.type).toBe("singlePressureLogger");
      if (selection.type === "singlePressureLogger") {
        expect(selection.id).toBe(pressureLogger.id);
      }
    });
  });
});
