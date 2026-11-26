import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { createMockResultsReader } from "src/__helpers__/state";
import type { EPSResultsReader } from "src/simulation/epanet/eps-results-reader";
import {
  getSortedDataForProperty,
  getSortedSimulationDataForBreaks,
} from "./symbology-data-source";

describe("getSortedDataForProperty", () => {
  const IDS = { P1: 1, P2: 2, P3: 3 } as const;

  const model = () =>
    HydraulicModelBuilder.with()
      .aPipe(IDS.P1, { roughness: 90, material: "Cast Iron" })
      .aPipe(IDS.P2, { roughness: null, material: "Cast Iron" })
      .aPipe(IDS.P3, { roughness: null, material: "PVC" })
      .aPipeMaterial({
        label: "Cast Iron",
        entries: [{ age: 0, roughness: 120 }],
      })
      .build();

  it("counts inferred values towards the breaks", () => {
    const data = getSortedDataForProperty("roughness", model(), null);

    expect(data).toEqual([90, 120]);
  });

  it("leaves other properties alone", () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aPipe(IDS.P1, { diameter: 300 })
      .aPipe(IDS.P2, { diameter: 100 })
      .build();

    const data = getSortedDataForProperty("diameter", hydraulicModel, null);

    expect(data).toEqual([100, 300]);
  });
});

describe("simulation data for breaks", () => {
  const IDS = { J1: 1, J2: 2 } as const;

  it("combines every timestep's values, sorted", async () => {
    const timesteps = [
      createMockResultsReader({
        junctions: { [IDS.J1]: { pressure: 30 } },
      }),
      createMockResultsReader({
        junctions: { [IDS.J1]: { pressure: 10 }, [IDS.J2]: { pressure: 20 } },
      }),
    ];
    const epsReader = {
      timestepCount: timesteps.length,
      getResultsForTimestep: (t: number) => Promise.resolve(timesteps[t]),
    } as never;

    const data = await getSortedSimulationDataForBreaks("pressure", {
      mode: "allSteps",
      epsReader,
    });

    expect(data).toEqual([10, 20, 30]);
  });

  it.each([
    { pressureUnit: "mwc", pressure: 10, psi: 14.22295 },
    { pressureUnit: "psi", pressure: 10, psi: 10 },
    { pressureUnit: "kPa", pressure: 100, psi: 14.50377 },
  ] as const)(
    "converts current-step pressure from $pressureUnit to PSI",
    async ({ pressureUnit, pressure, psi }) => {
      const resultsReader = createMockResultsReader({
        junctions: { [IDS.J1]: { pressure } },
      });

      const data = await getSortedSimulationDataForBreaks(
        "pressurePsi",
        { mode: "currentStep", resultsReader },
        { pressureUnit },
      );

      expect(data).toHaveLength(1);
      expect(data![0]).toBeCloseTo(psi, 4);
      expect(resultsReader.getAllValues("pressure")).toEqual(
        Float32Array.of(pressure),
      );
    },
  );

  it.each([
    { property: "pressurePsi", expected: 30 },
    { property: "minPressurePsi", expected: 10 },
    { property: "maxPressurePsi", expected: 60 },
  ] as const)(
    "reads the matching $property values",
    async ({ property, expected }) => {
      const values = new Map([
        ["pressure", Float32Array.of(30)],
        ["minPressure", Float32Array.of(10)],
        ["maxPressure", Float32Array.of(60)],
      ]);
      const resultsReader = createMockResultsReader();
      resultsReader.getAllValues = (sourceProperty) =>
        values.get(sourceProperty) ?? new Float32Array();

      const data = await getSortedSimulationDataForBreaks(
        property,
        { mode: "currentStep", resultsReader },
        { pressureUnit: "psi" },
      );

      expect(data).toEqual([expected]);
    },
  );

  it("does not convert, sort, or take absolute values in reader-owned storage", async () => {
    const source = Float32Array.of(20, -10);
    const resultsReader = createMockResultsReader();
    resultsReader.getAllValues = () => source;

    const data = await getSortedSimulationDataForBreaks(
      "pressurePsi",
      { mode: "currentStep", resultsReader },
      { pressureUnit: "mwc", absValues: true },
    );

    expect(data).toHaveLength(2);
    expect(data![0]).toBeCloseTo(14.22295, 4);
    expect(data![1]).toBeCloseTo(28.44589, 4);
    expect(source).toEqual(Float32Array.of(20, -10));
  });

  it.each([
    { mode: "initial", expected: [14.22295, 42.66884] },
    { mode: "allSteps", expected: [14.22295, 28.44589, 42.66884] },
  ] as const)(
    "converts EPS $mode breaks using the recorded pressure unit",
    async ({ mode, expected }) => {
      const timesteps = [10, 20, 30].map((pressure) =>
        createMockResultsReader({
          junctions: { [IDS.J1]: { pressure } },
        }),
      );
      const epsReader = {
        pressureUnits: "m",
        timestepCount: timesteps.length,
        getResultsForTimestep: (t: number) => Promise.resolve(timesteps[t]),
      } as unknown as EPSResultsReader;

      const data = await getSortedSimulationDataForBreaks("pressurePsi", {
        mode,
        epsReader,
      });

      expect(data).toHaveLength(expected.length);
      expected.forEach((value, index) =>
        expect(data![index]).toBeCloseTo(value, 4),
      );
    },
  );

  it.each([
    { pressureUnits: "ft", pressure: 10, psi: 4.33515 },
    { pressureUnits: "psi", pressure: 10, psi: 10 },
    { pressureUnits: "kPa", pressure: 100, psi: 14.50377 },
  ] as const)(
    "uses EPS $pressureUnits metadata when no source unit is supplied",
    async ({ pressureUnits, pressure, psi }) => {
      const resultsReader = createMockResultsReader({
        junctions: { [IDS.J1]: { pressure } },
      });
      const epsReader = {
        pressureUnits,
        timestepCount: 1,
        getResultsForTimestep: () => Promise.resolve(resultsReader),
      } as unknown as EPSResultsReader;

      const data = await getSortedSimulationDataForBreaks("pressurePsi", {
        mode: "initial",
        epsReader,
      });

      expect(data).toHaveLength(1);
      expect(data![0]).toBeCloseTo(psi, 4);
    },
  );

  it("requires a source pressure unit for a current-step PSI selection", async () => {
    const resultsReader = createMockResultsReader({
      junctions: { [IDS.J1]: { pressure: 10 } },
    });

    await expect(
      getSortedSimulationDataForBreaks("pressurePsi", {
        mode: "currentStep",
        resultsReader,
      }),
    ).rejects.toThrow("A source pressure unit is required");
  });
});
