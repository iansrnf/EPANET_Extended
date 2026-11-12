import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import type { Logger } from "@epanet-js/project-settings";
import { getProjectExtent } from "./project-extent";

const IDS = { JUNCTION: 1, OTHER_JUNCTION: 2, PIPE: 3 };
const logger: Logger = {
  id: "logger-1",
  label: "Logger 1",
  coordinates: [12, 15],
  connection: null,
};

describe("project extent", () => {
  it("fits a project containing only loggers", () => {
    const { assets } = HydraulicModelBuilder.with().build();

    expect(getProjectExtent(assets, [logger]).extract()).toEqual([
      12, 15, 12, 15,
    ]);
  });

  it("includes loggers outside the hydraulic network", () => {
    const { assets } = HydraulicModelBuilder.with()
      .aJunction(IDS.JUNCTION, { coordinates: [1, 2] })
      .aJunction(IDS.OTHER_JUNCTION, { coordinates: [3, 4] })
      .aPipe(IDS.PIPE, {
        startNodeId: IDS.JUNCTION,
        endNodeId: IDS.OTHER_JUNCTION,
      })
      .build();

    expect(getProjectExtent(assets, [logger]).extract()).toEqual([
      1, 2, 12, 15,
    ]);
    expect(getProjectExtent(assets).extract()).toEqual([1, 2, 3, 4]);
  });

  it("leaves an empty project without an extent", () => {
    const { assets } = HydraulicModelBuilder.with().build();

    expect(getProjectExtent(assets).isNothing()).toBe(true);
  });
});
