import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Provider } from "jotai";
import type { ReactNode } from "react";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import {
  createMockResultsReader,
  setInitialState,
} from "src/__helpers__/state";
import { buildOptimizedAssetsSource } from "src/map/data-source/features";
import type { EPSResultsReader } from "src/simulation";
import { simulationResultsDerivedAtom } from "src/state/derived-branch-state";
import {
  nodeSymbologyAtom,
  symbologyAtom,
  useSymbologyState,
} from "src/state/map-symbology";
import { projectSettingsAtom } from "src/state/project-settings";
import { simulationStepAtom } from "src/state/simulation";
import { useChangeColorBy } from "./use-change-color-by";
import {
  useRegenerateBreaks,
  type RegenerateResult,
} from "./use-regenerate-breaks";

afterEach(cleanup);

it("keeps PSI ranges, cached styles and feature labels consistent across timesteps", async () => {
  const IDS = { J1: 1, J2: 2 } as const;
  const hydraulicModel = HydraulicModelBuilder.with()
    .aJunction(IDS.J1)
    .aJunction(IDS.J2)
    .build();
  const readers = [
    createMockResultsReader({
      junctions: { [IDS.J1]: { pressure: 10 }, [IDS.J2]: { pressure: 30 } },
    }),
    createMockResultsReader({
      junctions: { [IDS.J1]: { pressure: 20 }, [IDS.J2]: { pressure: 50 } },
    }),
    createMockResultsReader({
      junctions: { [IDS.J1]: { pressure: 40 }, [IDS.J2]: { pressure: 60 } },
    }),
  ];
  const epsReader = {
    timestepCount: readers.length,
    getResultsForTimestep: (step: number) => Promise.resolve(readers[step]),
  } as unknown as EPSResultsReader;
  const store = setInitialState({
    hydraulicModel,
    simulationStep: 0,
    simulation: {
      status: "success",
      modelVersion: hydraulicModel.version,
      settingsVersion: "",
      report: "",
      epsResultsReader: epsReader,
    },
  });
  const settings = store.get(projectSettingsAtom);
  store.set(projectSettingsAtom, {
    ...settings,
    units: { ...settings.units, pressure: "mwc" },
    formatting: { ...settings.formatting, decimals: { pressure: 2 } },
  });
  const hook = renderHook(
    () => ({
      ...useChangeColorBy("node"),
      ...useRegenerateBreaks("node"),
      ...useSymbologyState(),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    },
  );
  await waitFor(() =>
    expect(store.get(simulationResultsDerivedAtom)).toBe(readers[0]),
  );

  await act(() => hook.result.current.changeColorBy("pressure"));
  const nativeRule = store.get(nodeSymbologyAtom).colorRule!;
  await act(() => hook.result.current.changeColorBy("pressurePsi"));
  const psiRule = store.get(nodeSymbologyAtom).colorRule!;
  expect(psiRule.unit).toBe("psi");
  expect(psiRule.breaks.at(-1)).toBeGreaterThan(nativeRule.breaks.at(-1)!);

  const regeneratedResults: (RegenerateResult | null)[] = [];
  await act(async () => {
    regeneratedResults.push(
      await hook.result.current.regenerate({
        ...psiRule,
        mode: "equalIntervals",
      }),
    );
  });
  const regenerated = regeneratedResults[0]!;
  expect(regenerated.error).toBe(false);
  expect(regenerated.colorRule.breaks[0]).toBeCloseTo(28.4);
  act(() =>
    hook.result.current.updateNodeSymbology({
      ...store.get(nodeSymbologyAtom),
      colorRule: regenerated.colorRule,
      labelRule: "pressurePsi",
    }),
  );
  const renderFeatures = () => {
    const project = store.get(projectSettingsAtom);
    return buildOptimizedAssetsSource(
      hydraulicModel.assets,
      store.get(symbologyAtom),
      project.units,
      project.formatting,
      (unit) => unit ?? "",
      store.get(simulationResultsDerivedAtom),
    );
  };
  const initialFeatures = await renderFeatures();
  expect(
    initialFeatures.find((feature) => feature.id === IDS.J1)?.properties,
  ).toMatchObject({ label: "14.22 psi", color: psiRule.colors[0] });

  act(() => store.set(simulationStepAtom, 2));
  await waitFor(() =>
    expect(store.get(simulationResultsDerivedAtom)).toBe(readers[2]),
  );
  const laterFeatures = await renderFeatures();
  expect(
    laterFeatures.find((feature) => feature.id === IDS.J2)?.properties,
  ).toMatchObject({ label: "85.34 psi", color: psiRule.colors.at(-1) });

  await act(async () => {
    regeneratedResults.push(
      await hook.result.current.regenerateFromCurrentStep(
        regenerated.colorRule,
      ),
      await hook.result.current.regenerateFromAllData(regenerated.colorRule),
    );
  });
  expect(regeneratedResults[1]!.colorRule.breaks[0]).toBeCloseTo(62.6);
  expect(regeneratedResults[2]!.colorRule.breaks[0]).toBeCloseTo(28.4);
  await act(() => hook.result.current.changeColorBy("pressure"));
  expect(store.get(nodeSymbologyAtom).colorRule).toBe(nativeRule);
  await act(() => hook.result.current.changeColorBy("pressurePsi"));
  expect(store.get(nodeSymbologyAtom).colorRule).toBe(regenerated.colorRule);
  expect(store.get(projectSettingsAtom).units.pressure).toBe("mwc");
});
