import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { SymbologySpec, nullSymbologySpec } from "src/map/symbology";
import { buildOptimizedAssetsSource } from "./features";
import { presets, FormattingSpec } from "@epanet-js/project-settings";
import {
  aLinkSymbology,
  aNodeSymbology,
  aRangeColorRule,
} from "src/__helpers__/state";
import { getColors } from "src/map/symbology/range-color-rule";
import { createMockResultsReader } from "src/__helpers__/state";

describe("build optimized source", () => {
  const defaultUnits = presets.LPS.units;
  const defaultFormatting: FormattingSpec = {
    decimals: presets.LPS.decimals,
    defaultDecimals: 3,
  };
  const fakeTranslateUnit = vi.fn();
  it("preserves core properties", async () => {
    const IDS = { ID: 1, J1: 2 } as const;
    const symbology = nullSymbologySpec;
    const { assets } = HydraulicModelBuilder.with()
      .aPipe(IDS.ID, {
        diameter: 300,
        initialStatus: "open",
      })
      .aJunction(IDS.J1, { elevation: 15 })
      .build();

    const features = await buildOptimizedAssetsSource(
      assets,
      symbology,
      defaultUnits,
      defaultFormatting,
      fakeTranslateUnit,
    );

    expect(features).toHaveLength(2);
    const [pipe, junction] = features;
    expect(pipe.properties).toEqual({
      type: "pipe",
      status: "open",
      isActive: true,
    });
    expect(pipe.properties).toEqual({
      type: "pipe",
      status: "open",
      isActive: true,
    });
    expect(pipe.geometry!.type).toEqual("LineString");

    expect(junction.properties).toEqual({ type: "junction", isActive: true });
    expect(junction.geometry!.type).toEqual("Point");

    expect(pipe.id).not.toEqual(junction.id);
  });

  it("includes isActive property from assets", async () => {
    const IDS = { ID: 1, ID2: 2, J1: 3, J2: 4 } as const;
    const symbology = nullSymbologySpec;
    const { assets } = HydraulicModelBuilder.with()
      .aPipe(IDS.ID, { initialStatus: "open", isActive: true })
      .aPipe(IDS.ID2, { initialStatus: "open", isActive: false })
      .aJunction(IDS.J1, { elevation: 15, isActive: true })
      .aJunction(IDS.J2, { elevation: 15, isActive: false })
      .build();

    const features = await buildOptimizedAssetsSource(
      assets,
      symbology,
      defaultUnits,
      defaultFormatting,
      fakeTranslateUnit,
    );

    expect(features).toHaveLength(4);
    const [activePipe, inactivePipe, activeJunction, inactiveJunction] =
      features;
    expect(activePipe.properties!.isActive).toEqual(true);
    expect(inactivePipe.properties!.isActive).toEqual(false);
    expect(activeJunction.properties!.isActive).toEqual(true);
    expect(inactiveJunction.properties!.isActive).toEqual(false);
  });

  it("uses pump status when available", async () => {
    const IDS = { pu1: 1, pu2: 2 } as const;
    const symbology = nullSymbologySpec;
    const { assets } = HydraulicModelBuilder.with()
      .aPump(IDS.pu1, { initialStatus: "off" })
      .aPump(IDS.pu2, { initialStatus: "off" })
      .build();
    const simulationResults = createMockResultsReader({
      pumps: { [IDS.pu1]: { status: "on" } },
    });

    const features = await buildOptimizedAssetsSource(
      assets,
      symbology,
      defaultUnits,
      defaultFormatting,
      fakeTranslateUnit,
      simulationResults,
    );

    expect(features).toHaveLength(2);
    const [pu1, pu2] = features;
    expect(pu1.properties!.status).toEqual("on");
    expect(pu2.properties!.status).toEqual("off");
  });

  describe("node symbology", () => {
    it("includes props for styling to junctions", async () => {
      const IDS = { J1: 1 } as const;
      const symbology: SymbologySpec = {
        ...nullSymbologySpec,
        node: aNodeSymbology({
          colorRule: aRangeColorRule({
            breaks: [10, 20, 30],
            property: "pressure",
            unit: "m",
            colors: getColors("Temps", 4),
          }),
        }),
      };
      const { assets } = HydraulicModelBuilder.with()
        .aJunction(IDS.J1, { elevation: 15 })
        .build();
      const simulationResults = createMockResultsReader({
        junctions: { [IDS.J1]: { pressure: 10 } },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        defaultFormatting,
        fakeTranslateUnit,
        simulationResults,
      );

      const [junction] = features;
      expect(junction.properties!.type).toEqual("junction");
      expect(junction.properties!.color).not.toBeUndefined();
      expect(junction.properties!.strokeColor).not.toBeUndefined();
    });

    it("assigns same value to 0 and missing simulation results", async () => {
      const IDS = { J1: 1, J2: 2 } as const;
      const symbology: SymbologySpec = {
        ...nullSymbologySpec,
        node: aNodeSymbology({
          colorRule: aRangeColorRule({
            breaks: [10, 20, 30],
            property: "pressure",
            unit: "m",
            colors: getColors("Temps", 4),
          }),
        }),
      };
      const { assets } = HydraulicModelBuilder.with()
        .aJunction(IDS.J1, { elevation: 15 })
        .aJunction(IDS.J2, { elevation: 15 })
        .build();
      const simulationResults = createMockResultsReader({
        junctions: { [IDS.J1]: { pressure: 0 } },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        defaultFormatting,
        fakeTranslateUnit,
        simulationResults,
      );

      const [j1, j2] = features;
      // A missing simulation result falls back to the lowest bracket, same as
      // a real 0, rather than the default color.
      expect(j1.properties!.color).toEqual(expect.stringMatching("#"));
      expect(j2.properties!.color).toEqual(expect.stringMatching("#"));
      expect(j1.properties!.color).toEqual(j2.properties!.color);
    });

    it("leaves a junction with a NaN simulation result uncolored", async () => {
      const IDS = { J1: 1 } as const;
      const symbology: SymbologySpec = {
        ...nullSymbologySpec,
        node: aNodeSymbology({
          colorRule: aRangeColorRule({
            breaks: [10, 20, 30],
            property: "pressure",
            unit: "m",
            colors: getColors("Temps", 4),
          }),
        }),
      };
      const { assets } = HydraulicModelBuilder.with()
        .aJunction(IDS.J1, { elevation: 15 })
        .build();
      const simulationResults = createMockResultsReader({
        junctions: { [IDS.J1]: { pressure: NaN } },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        defaultFormatting,
        fakeTranslateUnit,
        simulationResults,
      );

      const [junction] = features;
      expect(junction.properties!.color).toBeUndefined();
      expect(junction.properties!.strokeColor).toBeUndefined();
    });

    it("includes labels when specified", async () => {
      const IDS = { J1: 1 } as const;
      const symbology: SymbologySpec = {
        ...nullSymbologySpec,
        node: aNodeSymbology({
          labelRule: "pressure",
        }),
      };
      const { assets } = HydraulicModelBuilder.with()
        .aJunction(IDS.J1, { elevation: 15 })
        .build();
      const simulationResults = createMockResultsReader({
        junctions: { [IDS.J1]: { pressure: 10 } },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        defaultFormatting,
        () => "m",
        simulationResults,
      );

      const [junction] = features;
      expect(junction.properties!.label).toEqual("10 m");
    });

    it("omits the label when the value is missing", async () => {
      const IDS = { J1: 1 } as const;
      const symbology: SymbologySpec = {
        ...nullSymbologySpec,
        node: aNodeSymbology({
          labelRule: "pressure",
        }),
      };
      const { assets } = HydraulicModelBuilder.with()
        .aJunction(IDS.J1, { elevation: 15 })
        .build();

      // No simulation results provided → no pressure value.
      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        defaultFormatting,
        () => "m",
      );

      const [junction] = features;
      expect(junction.properties!.label).toBeUndefined();
    });

    it.each([
      {
        property: "pressurePsi",
        sourceUnit: "mwc",
        label: "14.22 psi",
        color: "#222222",
      },
      {
        property: "minPressurePsi",
        sourceUnit: "mwc",
        label: "11.38 psi",
        color: "#111111",
      },
      {
        property: "maxPressurePsi",
        sourceUnit: "mwc",
        label: "42.67 psi",
        color: "#333333",
      },
      {
        property: "pressurePsi",
        sourceUnit: "psi",
        label: "10 psi",
        color: "#111111",
      },
      {
        property: "minPressurePsi",
        sourceUnit: "psi",
        label: "8 psi",
        color: "#111111",
      },
      {
        property: "maxPressurePsi",
        sourceUnit: "psi",
        label: "30 psi",
        color: "#333333",
      },
    ] as const)(
      "renders $property colors and labels from $sourceUnit results",
      async ({ property, sourceUnit, label, color }) => {
        const IDS = { J1: 1 } as const;
        const { assets } = HydraulicModelBuilder.with()
          .aJunction(IDS.J1)
          .build();
        const symbology: SymbologySpec = {
          ...nullSymbologySpec,
          node: aNodeSymbology({
            colorRule: aRangeColorRule({
              property,
              unit: "psi",
              breaks: [12, 20],
              colors: ["#111111", "#222222", "#333333"],
            }),
            labelRule: property,
          }),
        };
        const simulationResults = createMockResultsReader({
          junctions: {
            [IDS.J1]: { pressure: 10, minPressure: 8, maxPressure: 30 },
          },
        });

        const [junction] = await buildOptimizedAssetsSource(
          assets,
          symbology,
          { ...defaultUnits, pressure: sourceUnit },
          { ...defaultFormatting, decimals: { pressure: 2 } },
          (unit) => unit ?? "",
          simulationResults,
        );

        expect(junction.properties).toMatchObject({ color, label });
        expect(junction.properties!.strokeColor).toBeDefined();
      },
    );

    it("keeps native pressure colors when labels use PSI", async () => {
      const IDS = { J1: 1 } as const;
      const { assets } = HydraulicModelBuilder.with().aJunction(IDS.J1).build();
      const symbology: SymbologySpec = {
        ...nullSymbologySpec,
        node: aNodeSymbology({
          colorRule: aRangeColorRule({
            property: "pressure",
            unit: "mwc",
            breaks: [12, 20],
            colors: ["#111111", "#222222", "#333333"],
          }),
          labelRule: "pressurePsi",
        }),
      };
      const [junction] = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        { ...defaultFormatting, decimals: { pressure: 2 } },
        (unit) => unit ?? "",
        createMockResultsReader({ junctions: { [IDS.J1]: { pressure: 10 } } }),
      );

      expect(junction.properties).toMatchObject({
        color: "#111111",
        label: "14.22 psi",
      });
    });

    it.each(["minPressure", "maxPressure"])(
      "uses pressure units and precision for native %s labels",
      async (property) => {
        const IDS = { J1: 1 } as const;
        const { assets } = HydraulicModelBuilder.with()
          .aJunction(IDS.J1)
          .build();
        const [junction] = await buildOptimizedAssetsSource(
          assets,
          {
            ...nullSymbologySpec,
            node: aNodeSymbology({ labelRule: property }),
          },
          defaultUnits,
          { ...defaultFormatting, decimals: { pressure: 2 } },
          (unit) => (unit === "mwc" ? "m" : (unit ?? "")),
          createMockResultsReader({
            junctions: { [IDS.J1]: { minPressure: 8.125, maxPressure: 8.125 } },
          }),
        );

        expect(junction.properties!.label).toBe("8.13 m");
      },
    );

    it("uses the lowest PSI color without inventing a missing pressure label", async () => {
      const IDS = { J1: 1 } as const;
      const { assets } = HydraulicModelBuilder.with().aJunction(IDS.J1).build();
      const [junction] = await buildOptimizedAssetsSource(
        assets,
        {
          ...nullSymbologySpec,
          node: aNodeSymbology({
            colorRule: aRangeColorRule({
              property: "pressurePsi",
              unit: "psi",
              breaks: [12, 20],
              colors: ["#111111", "#222222", "#333333"],
            }),
            labelRule: "pressurePsi",
          }),
        },
        defaultUnits,
        defaultFormatting,
        (unit) => unit ?? "",
      );

      expect(junction.properties!.color).toBe("#111111");
      expect(junction.properties!.label).toBeUndefined();
    });
  });

  describe("link symbology", () => {
    const symbology: SymbologySpec = {
      ...nullSymbologySpec,
      link: aLinkSymbology({
        colorRule: aRangeColorRule({
          breaks: [10, 20, 30],
          property: "flow",
          colors: getColors("Temps", 4),
          absValues: true,
        }),
      }),
    };

    it("includes props for styling to pipes", async () => {
      const IDS = { ID: 1, J1: 2 } as const;
      const { assets } = HydraulicModelBuilder.with()
        .aPipe(IDS.ID, {
          diameter: 300,
          initialStatus: "open",
          length: 14,
        })
        .aJunction(IDS.J1, { elevation: 15 })
        .build();
      const simulationResults = createMockResultsReader({
        pipes: { [IDS.ID]: { flow: 10 } },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        defaultFormatting,
        fakeTranslateUnit,
        simulationResults,
      );

      const [pipe] = features;
      expect(pipe.properties).toEqual(
        expect.objectContaining({
          type: "pipe",
          status: "open",
          length: 14,
          hasArrow: true,
          rotation: 0,
        }),
      );
    });

    it("includes labels to pipes", async () => {
      const IDS = { ID: 1 } as const;
      const symbology: SymbologySpec = {
        ...nullSymbologySpec,
        link: aLinkSymbology({
          labelRule: "flow",
        }),
      };

      const { assets } = HydraulicModelBuilder.with()
        .aPipe(IDS.ID, {
          diameter: 300,
          initialStatus: "open",
          length: 14,
        })
        .build();
      const simulationResults = createMockResultsReader({
        pipes: { [IDS.ID]: { flow: -10 } },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        defaultFormatting,
        () => "l/s",
        simulationResults,
      );

      const [pipe] = features;
      expect(pipe.properties).toMatchObject({
        label: "-10 l/s",
      });
    });

    it("reverses arrow when value is negative", async () => {
      const IDS = { ID: 1, ID_REVERSE: 2 } as const;
      const { assets } = HydraulicModelBuilder.with()
        .aPipe(IDS.ID)
        .aPipe(IDS.ID_REVERSE)
        .build();
      const simulationResults = createMockResultsReader({
        pipes: {
          [IDS.ID]: { flow: 10 },
          [IDS.ID_REVERSE]: { flow: -10 },
        },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        defaultFormatting,
        fakeTranslateUnit,
        simulationResults,
      );

      const [pipe, reversed] = features;
      expect(pipe.properties).toMatchObject({
        rotation: 0,
      });
      expect(reversed.properties).toMatchObject({
        rotation: -180,
      });
      expect(pipe.properties!.color).toEqual(reversed.properties!.color);
    });

    it("applies the direction based on the flow", async () => {
      const IDS = { ID: 1 } as const;
      const symbology: SymbologySpec = {
        ...nullSymbologySpec,
        link: aLinkSymbology({
          colorRule: aRangeColorRule({
            breaks: [10, 20, 30],
            property: "velocity",
            colors: getColors("Temps", 4),
            absValues: true,
          }),
        }),
      };
      const { assets } = HydraulicModelBuilder.with().aPipe(IDS.ID).build();
      const simulationResults = createMockResultsReader({
        pipes: { [IDS.ID]: { flow: -10, velocity: 20 } },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        defaultFormatting,
        fakeTranslateUnit,
        simulationResults,
      );

      const [pipe] = features;
      expect(pipe.properties).toMatchObject({
        rotation: -180,
      });
    });

    it("assigns same value to 0 and missing simulation results", async () => {
      const IDS = { p1: 1, p2: 2 } as const;
      const { assets } = HydraulicModelBuilder.with()
        .aPipe(IDS.p1)
        .aPipe(IDS.p2)
        .build();
      const simulationResults = createMockResultsReader({
        pipes: { [IDS.p1]: { flow: 0 } },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        defaultFormatting,
        fakeTranslateUnit,
        simulationResults,
      );

      const [p1, p2] = features;
      // A missing simulation result falls back to the lowest bracket, same as
      // a real 0, rather than the default color.
      expect(p1.properties).toMatchObject({
        color: expect.stringMatching("#"),
        hasArrow: true,
      });
      expect(p2.properties).toMatchObject({
        color: expect.stringMatching("#"),
        hasArrow: false,
      });
      expect(p1.properties!.color).toEqual(p2.properties!.color);
    });

    it("leaves a pipe with a NaN simulation result uncolored", async () => {
      const IDS = { p1: 1 } as const;
      const { assets } = HydraulicModelBuilder.with().aPipe(IDS.p1).build();
      const simulationResults = createMockResultsReader({
        pipes: { [IDS.p1]: { flow: NaN } },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        defaultFormatting,
        fakeTranslateUnit,
        simulationResults,
      );

      const [pipe] = features;
      expect(pipe.properties!.color).toBeUndefined();
    });

    it("hides the arrow of a pipe with a NaN flow", async () => {
      const IDS = { p1: 1 } as const;
      const { assets } = HydraulicModelBuilder.with()
        .aPipe(IDS.p1, { initialStatus: "open" })
        .build();
      const simulationResults = createMockResultsReader({
        pipes: { [IDS.p1]: { flow: NaN } },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        defaultUnits,
        defaultFormatting,
        fakeTranslateUnit,
        simulationResults,
      );

      const [pipe] = features;
      expect(pipe.properties!.hasArrow).toBe(false);
    });

    it("omits the label of a pipe with a NaN result", async () => {
      const IDS = { p1: 1 } as const;
      const labelSymbology: SymbologySpec = {
        ...nullSymbologySpec,
        link: aLinkSymbology({ labelRule: "flow" }),
      };
      const { assets } = HydraulicModelBuilder.with().aPipe(IDS.p1).build();
      const simulationResults = createMockResultsReader({
        pipes: { [IDS.p1]: { flow: NaN } },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        labelSymbology,
        defaultUnits,
        defaultFormatting,
        () => "l/s",
        simulationResults,
      );

      const [pipe] = features;
      expect(pipe.properties!.label).toBeUndefined();
    });

    it("leaves a null static attribute uncolored so it uses the default color", async () => {
      const IDS = { p1: 1 } as const;
      const staticSymbology: SymbologySpec = {
        ...nullSymbologySpec,
        link: aLinkSymbology({
          colorRule: aRangeColorRule({
            breaks: [10, 20, 30],
            property: "roughness",
            colors: getColors("Temps", 4),
          }),
        }),
      };
      const { assets } = HydraulicModelBuilder.with()
        .aPipe(IDS.p1, { roughness: null })
        .build();

      const features = await buildOptimizedAssetsSource(
        assets,
        staticSymbology,
        defaultUnits,
        defaultFormatting,
        fakeTranslateUnit,
      );

      const [pipe] = features;
      expect(pipe.properties!.color).toBeUndefined();
    });

    it("colors a pipe by the roughness resolved for it", async () => {
      const IDS = { p1: 1 } as const;
      const staticSymbology: SymbologySpec = {
        ...nullSymbologySpec,
        link: aLinkSymbology({
          colorRule: aRangeColorRule({
            breaks: [10, 20, 30],
            property: "roughness",
            colors: getColors("Temps", 4),
          }),
        }),
      };
      const { assets } = HydraulicModelBuilder.with()
        .aPipe(IDS.p1, { roughness: null })
        .build();

      const features = await buildOptimizedAssetsSource(
        assets,
        staticSymbology,
        defaultUnits,
        defaultFormatting,
        fakeTranslateUnit,
        null,
        undefined,
        { pipe: { roughness: () => 25 } },
      );

      const [pipe] = features;
      expect(pipe.properties!.color).toBe(getColors("Temps", 4)[2]);
    });

    it("assigns lengths in meters", async () => {
      const IDS = { p1: 1 } as const;
      const gpmUnits = presets.GPM.units;
      const gpmFormatting: FormattingSpec = {
        decimals: presets.GPM.decimals,
        defaultDecimals: 3,
      };
      const { assets } = HydraulicModelBuilder.with({})
        .aPipe(IDS.p1, { length: 10 })
        .build();
      const simulationResults = createMockResultsReader({
        pipes: { [IDS.p1]: { flow: 5 } },
      });

      const features = await buildOptimizedAssetsSource(
        assets,
        symbology,
        gpmUnits,
        gpmFormatting,
        fakeTranslateUnit,
        simulationResults,
      );

      const [p1] = features;
      expect(p1.properties).toMatchObject({ length: 3.048 });
    });
  });
});
