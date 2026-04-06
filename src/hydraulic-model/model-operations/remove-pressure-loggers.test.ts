import { HydraulicModelBuilder } from "src/__helpers__/hydraulic-model-builder";
import { PressureLogger } from "src/hydraulic-model/pressure-loggers";
import { removePressureLoggers } from "./remove-pressure-loggers";

describe("removePressureLoggers", () => {
  it("deletes hidden backing junctions for pressure loggers", () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(1, {
        coordinates: [10, 20],
      })
      .build();

    hydraulicModel.assets.get(1)?.setProperty("visibility", false);
    hydraulicModel.assets.get(1)?.setProperty("pressureLoggerId", 100);
    hydraulicModel.pressureLoggers.set(
      100,
      new PressureLogger(100, [10, 20], {
        label: "L1",
        connection: { junctionId: 1 },
      }),
    );

    const moment = removePressureLoggers(hydraulicModel, {
      pressureLoggerIds: [100],
    });

    expect(moment.deleteAssets).toEqual([1]);
    expect(moment.deletePressureLoggers).toEqual([100]);
  });

  it("does not delete visible network junctions directly connected to pressure loggers", () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(1, {
        coordinates: [30, 40],
      })
      .build();

    hydraulicModel.pressureLoggers.set(
      100,
      new PressureLogger(100, [10, 20], {
        label: "L1",
        connection: { junctionId: 1 },
      }),
    );

    const moment = removePressureLoggers(hydraulicModel, {
      pressureLoggerIds: [100],
    });

    expect(moment.deleteAssets).toEqual([]);
    expect(moment.deletePressureLoggers).toEqual([100]);
  });
});
