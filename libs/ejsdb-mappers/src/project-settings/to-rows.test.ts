import { defaultProjectSettings } from "@epanet-js/project-settings";
import { serializeProjectSettings } from "./to-rows";
import { buildProjectSettingsData } from "./builders";

describe("serializeProjectSettings", () => {
  it("produces a JSON string that round-trips through JSON.parse", () => {
    const data = serializeProjectSettings(defaultProjectSettings);
    expect(JSON.parse(data)).toEqual(defaultProjectSettings);
  });

  it("throws when the headloss formula is not a known value", () => {
    expect(() =>
      serializeProjectSettings({
        ...defaultProjectSettings,
        headlossFormula: "NOT-A-FORMULA" as never,
      }),
    ).toThrow(/Project settings: data does not match schema/);
  });

  it("throws when the projection centroid contains a NaN", () => {
    expect(() =>
      serializeProjectSettings({
        ...defaultProjectSettings,
        projection: {
          type: "xy-grid",
          id: "grid",
          name: "Grid",
          centroid: [NaN, 0],
        },
      }),
    ).toThrow(/Project settings: data does not match schema/);
  });

  it("preserves logger coordinates and pipe or node connections", () => {
    const IDS = { L1: "1", L2: "2", P1: 3, J1: 4 } as const;
    const settings = {
      ...defaultProjectSettings,
      loggers: [
        {
          id: IDS.L1,
          label: "Logger 1",
          coordinates: [10, 20] as [number, number],
          connection: {
            assetId: IDS.P1,
            snapPoint: [11, 20] as [number, number],
          },
        },
        {
          id: IDS.L2,
          label: "Logger 2",
          coordinates: [30, 40] as [number, number],
          connection: {
            assetId: IDS.J1,
            snapPoint: [30, 41] as [number, number],
          },
        },
      ],
    };
    expect(
      buildProjectSettingsData(serializeProjectSettings(settings)),
    ).toEqual(settings);
  });

  it("rejects invalid logger coordinates and duplicate IDs or labels", () => {
    const IDS = { L1: "1", L2: "2", P1: 3 } as const;
    const logger = {
      id: IDS.L1,
      label: "Logger 1",
      coordinates: [10, 20] as [number, number],
      connection: null,
    };
    for (const loggers of [
      [{ ...logger, coordinates: [NaN, 20] as [number, number] }],
      [
        {
          ...logger,
          connection: {
            assetId: IDS.P1,
            snapPoint: [Infinity, 20] as [number, number],
          },
        },
      ],
      [logger, { ...logger, label: "Logger 2" }],
      [logger, { ...logger, id: IDS.L2, label: "logger 1" }],
    ]) {
      expect(() =>
        serializeProjectSettings({ ...defaultProjectSettings, loggers }),
      ).toThrow(/Project settings: data does not match schema/);
    }
  });
});
