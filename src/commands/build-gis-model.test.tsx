import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { Just } from "purify-ts/Maybe";
import { vi } from "vitest";
import type { BBox } from "geojson";
import {
  buildCustomAttributeId,
  initializeModelFactories,
  LabelManager,
} from "@epanet-js/hydraulic-model";
import {
  HydraulicModelBuilder,
  WritableIdGenerator,
} from "@epanet-js/hydraulic-model-testing";
import { sharedIdPools } from "@epanet-js/id-generator";
import { defaultProjectSettings } from "@epanet-js/project-settings";
import type { ProjectLoadInput } from "src/hooks/persistence/use-start-new-project";
import type { PreparedGisModel } from "src/lib/model-builder/prepare-model";
import type {
  NetworkBuildOptions,
  NetworkLayer,
} from "src/lib/model-builder/network";
import type { GisBuildMetadata } from "src/lib/model-builder/build-types";
import { inpFileInfoAtom, projectFileInfoAtom } from "src/state/file-system";
import { savedProjectRevisionAtom } from "src/state/project-revision";
import { useBuildGisModel } from "./build-gis-model";

const prepareGisModel = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<PreparedGisModel>>(),
);
const startNewProject = vi.hoisted(() =>
  vi.fn<(input: ProjectLoadInput) => Promise<boolean>>(),
);
const checkUnsavedChanges = vi.hoisted(() =>
  vi.fn<(onContinue: () => Promise<void>) => void>(),
);
const showNetworkReview = vi.hoisted(() => vi.fn());
const saveCustomAttributes = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<void>>(),
);
const capture = vi.hoisted(() => vi.fn());
const fitBounds = vi.hoisted(() => vi.fn());

vi.mock("src/lib/model-builder/prepare-model", () => ({ prepareGisModel }));
vi.mock("src/hooks/persistence/use-start-new-project", () => ({
  useStartNewProject: () => ({ startNewProject }),
}));
vi.mock("src/commands/check-unsaved-changes", () => ({
  useUnsavedChangesCheck: () => checkUnsavedChanges,
}));
vi.mock("src/commands/show-network-review", () => ({
  useShowNetworkReview: () => showNetworkReview,
}));
vi.mock("src/lib/db", () => ({ saveCustomAttributes }));
vi.mock("src/infra/user-tracking", () => ({
  useUserTracking: () => ({ capture }),
}));
vi.mock("src/hooks/use-translate", () => ({
  useTranslate: () => (key: string) => key,
}));
vi.mock("src/infra/error-tracking", () => ({ captureError: vi.fn() }));
vi.mock("src/components/notifications", () => ({ notify: vi.fn() }));
vi.mock("src/map", async () => {
  const { createContext } = await import("react");
  return { MapContext: createContext({ map: { fitBounds } }) };
});

const options: NetworkBuildOptions = {
  units: { flow: "l/s", length: "m", diameter: "mm" },
  headlossFormula: "H-W",
  snapTolerance: 0.1,
};
const metadata: GisBuildMetadata = {
  name: "Built network",
  flowUnit: "l/s",
  unitSystem: "metric",
};
const layers: NetworkLayer[] = [
  { id: "mains", name: "Mains", role: "pipe", features: [] },
];

describe("buildGisModel", () => {
  beforeEach(() => {
    prepareGisModel.mockReset();
    startNewProject.mockReset().mockResolvedValue(true);
    checkUnsavedChanges.mockReset();
    showNetworkReview.mockReset();
    saveCustomAttributes.mockReset().mockResolvedValue(undefined);
    capture.mockReset();
    fitBounds.mockReset();
  });

  it("prepares the build without replacing the active project", async () => {
    const prepared = preparedFixture();
    prepareGisModel.mockResolvedValue(prepared);
    const { store, result, originalFile } = renderCommand();

    const report = await result.current.build(layers, options, metadata);

    expect(report).toBe(prepared.report);
    expect(startNewProject).not.toHaveBeenCalled();
    expect(checkUnsavedChanges).not.toHaveBeenCalled();
    expect(saveCustomAttributes).not.toHaveBeenCalled();
    expect(showNetworkReview).not.toHaveBeenCalled();
    expect(store.get(projectFileInfoAtom)).toBe(originalFile);
    expect(store.get(savedProjectRevisionAtom)).toBe("original revision");
  });

  it("waits for the unsaved-changes decision before opening the prepared model", async () => {
    const prepared = preparedFixture();
    prepareGisModel.mockResolvedValue(prepared);
    const { store, result, originalFile } = renderCommand();
    await result.current.build(layers, options, metadata);

    act(() => result.current.openModel());

    expect(startNewProject).not.toHaveBeenCalled();
    expect(store.get(projectFileInfoAtom)).toBe(originalFile);
    const continueOpening = checkUnsavedChanges.mock.calls[0][0];
    await act(async () => {
      await continueOpening();
    });

    expect(startNewProject).toHaveBeenCalledWith(
      expect.objectContaining({
        hydraulicModel: prepared.model.hydraulicModel,
        factories: prepared.model.factories,
        projectSettings: expect.objectContaining({ name: prepared.name }),
        simulationSettings: expect.objectContaining({
          timing: expect.objectContaining({ duration: 0 }),
        }),
      }),
    );
    expect(saveCustomAttributes).toHaveBeenCalledWith(
      prepared.model.hydraulicModel.customAttributes,
    );
    expect(fitBounds).toHaveBeenCalledOnce();
    expect(store.get(projectFileInfoAtom)).toBeNull();
    expect(store.get(inpFileInfoAtom)).toBeNull();
    expect(store.get(savedProjectRevisionAtom)).toBeNull();
    expect(showNetworkReview).toHaveBeenCalledWith({ source: "auto" });
  });

  it.each([
    { status: "failed", error: new Error("Invalid source") },
    { status: "canceled", error: new DOMException("Canceled", "AbortError") },
  ])(
    "clears the previous prepared model when a new build is $status",
    async ({ error }) => {
      prepareGisModel
        .mockResolvedValueOnce(preparedFixture())
        .mockRejectedValueOnce(error);
      const { store, result, originalFile } = renderCommand();
      await result.current.build(layers, options, metadata);

      await expect(
        result.current.build(layers, options, metadata),
      ).rejects.toBe(error);
      act(() => result.current.openModel());

      expect(checkUnsavedChanges).not.toHaveBeenCalled();
      expect(startNewProject).not.toHaveBeenCalled();
      expect(store.get(projectFileInfoAtom)).toBe(originalFile);
      expect(store.get(savedProjectRevisionAtom)).toBe("original revision");
    },
  );

  it("does not mark files unsaved or show review when the project cannot start", async () => {
    prepareGisModel.mockResolvedValue(preparedFixture());
    startNewProject.mockResolvedValue(false);
    const { store, result, originalFile } = renderCommand();
    await result.current.build(layers, options, metadata);
    act(() => result.current.openModel());
    await act(async () => {
      await checkUnsavedChanges.mock.calls[0][0]();
    });

    expect(saveCustomAttributes).not.toHaveBeenCalled();
    expect(fitBounds).not.toHaveBeenCalled();
    expect(showNetworkReview).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalledWith({
      name: "modelBuilder.completed",
    });
    expect(store.get(projectFileInfoAtom)).toBe(originalFile);
    expect(store.get(savedProjectRevisionAtom)).toBe("original revision");
  });

  it("rejects late cancellation before making a prepared result openable", async () => {
    const controller = new AbortController();
    let completePreparation!: (value: PreparedGisModel) => void;
    prepareGisModel.mockReturnValue(
      new Promise((resolve) => {
        completePreparation = resolve;
      }),
    );
    const { result } = renderCommand();
    const pending = result.current.build(layers, options, {
      ...metadata,
      signal: controller.signal,
    });
    controller.abort();
    const rejection = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    completePreparation(preparedFixture());

    await rejection;
    act(() => result.current.openModel());

    expect(checkUnsavedChanges).not.toHaveBeenCalled();
    expect(startNewProject).not.toHaveBeenCalled();
  });

  it("keeps the newer build when an older preparation resolves last", async () => {
    let completeOlderPreparation!: (value: PreparedGisModel) => void;
    const latest = preparedFixture("Latest network");
    prepareGisModel
      .mockReturnValueOnce(
        new Promise((resolve) => {
          completeOlderPreparation = resolve;
        }),
      )
      .mockResolvedValueOnce(latest);
    const { result } = renderCommand();
    const older = result.current.build(layers, options, metadata);
    const rejection = expect(older).rejects.toMatchObject({
      name: "AbortError",
    });
    await result.current.build(layers, options, {
      ...metadata,
      name: latest.name,
    });
    completeOlderPreparation(preparedFixture("Outdated network"));
    await rejection;

    act(() => result.current.openModel());
    await act(async () => {
      await checkUnsavedChanges.mock.calls[0][0]();
    });

    expect(startNewProject.mock.calls[0][0].hydraulicModel).toBe(
      latest.model.hydraulicModel,
    );
    expect(startNewProject.mock.calls[0][0].projectSettings.name).toBe(
      latest.name,
    );
  });
});

const renderCommand = () => {
  const store = createStore();
  const originalFile = { name: "Existing network.ejsdb", lastSavedAt: 1 };
  store.set(projectFileInfoAtom, originalFile);
  store.set(savedProjectRevisionAtom, "original revision");
  const { result } = renderHook(() => useBuildGisModel(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
  return { store, result, originalFile };
};

const preparedFixture = (name = "Built network"): PreparedGisModel => {
  const IDS = { J1: 1, J2: 2, P1: 3, ATTRIBUTE: 4 } as const;
  const idGenerator = new WritableIdGenerator();
  const labelManager = new LabelManager();
  const hydraulicModel = HydraulicModelBuilder.with({
    idGenerator,
    labelManager,
  })
    .aJunction(IDS.J1, { coordinates: [125, 6] })
    .aJunction(IDS.J2, { coordinates: [125.001, 6] })
    .aPipe(IDS.P1, { startNodeId: IDS.J1, endNodeId: IDS.J2 })
    .aCustomAttribute("pipe", {
      id: buildCustomAttributeId(IDS.ATTRIBUTE),
      label: "District",
      type: "text",
    })
    .build();
  const factories = initializeModelFactories({
    idPools: sharedIdPools(idGenerator),
    labelManager,
  });
  const bounds: BBox = [125, 6, 125.001, 6];
  return {
    name,
    report: {
      assetCount: hydraulicModel.assets.size,
      issues: [],
      summary: { junction: 2, pipe: 1 },
    },
    model: {
      hydraulicModel,
      factories,
      idGenerator,
      bounds: Just(bounds),
      selectionSets: [],
      issues: [],
      projectSettings: {
        units: defaultProjectSettings.units,
        defaults: defaultProjectSettings.defaults,
        headlossFormula: defaultProjectSettings.headlossFormula,
        formatting: defaultProjectSettings.formatting,
        projection: defaultProjectSettings.projection,
      },
    },
  };
};
