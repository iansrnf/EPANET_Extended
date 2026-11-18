import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { vi } from "vitest";
import { contentViewAtom } from "src/state/content-view";
import { dialogAtom } from "src/state/dialog";
import { projectFileInfoAtom } from "src/state/file-system";
import { useOpenModelBuilder } from "./open-model-builder";

const configuration = vi.hoisted(() => ({ embedded: false }));
const checkUnsavedChanges = vi.hoisted(() =>
  vi.fn<(onContinue: () => Promise<void>) => void>(),
);
const startBlankProject = vi.hoisted(() => vi.fn<() => Promise<boolean>>());

vi.mock("src/global-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/global-config")>()),
  get isModelBuilderEmbedded() {
    return configuration.embedded;
  },
}));
vi.mock("src/commands/check-unsaved-changes", () => ({
  useUnsavedChangesCheck: () => checkUnsavedChanges,
}));
vi.mock("src/hooks/persistence/use-start-new-project", () => ({
  useStartBlankProject: () => startBlankProject,
}));
vi.mock("src/infra/user-tracking", () => ({
  useUserTracking: () => ({ capture: vi.fn() }),
}));

describe("openModelBuilder", () => {
  beforeEach(() => {
    configuration.embedded = false;
    checkUnsavedChanges.mockReset();
    startBlankProject.mockReset().mockResolvedValue(true);
  });

  it("keeps the current project when opening the native builder", () => {
    const { store, result } = renderCommand();
    const currentProject = { name: "Existing network.ejsdb" };
    store.set(projectFileInfoAtom, currentProject);

    act(() => result.current({ source: "test" }));

    expect(store.get(contentViewAtom)).toEqual({
      type: "modelBuild",
      step: null,
    });
    expect(store.get(dialogAtom)).toBeNull();
    expect(store.get(projectFileInfoAtom)).toBe(currentProject);
    expect(checkUnsavedChanges).not.toHaveBeenCalled();
    expect(startBlankProject).not.toHaveBeenCalled();
  });

  it("waits for unsaved changes before replacing the project for embedding", async () => {
    configuration.embedded = true;
    const { store, result } = renderCommand();

    act(() => result.current({ source: "test" }));

    expect(store.get(contentViewAtom)).toBeNull();
    expect(startBlankProject).not.toHaveBeenCalled();

    const continueImport = checkUnsavedChanges.mock.calls[0][0];
    await act(async () => {
      await continueImport();
    });

    expect(startBlankProject).toHaveBeenCalledOnce();
    expect(store.get(contentViewAtom)).toEqual({
      type: "modelBuild",
      step: null,
    });
    expect(store.get(dialogAtom)).toBeNull();
  });

  it("keeps the current view when the embedded project cannot start", async () => {
    configuration.embedded = true;
    startBlankProject.mockResolvedValue(false);
    const { store, result } = renderCommand();

    act(() => result.current({ source: "test" }));

    const continueImport = checkUnsavedChanges.mock.calls[0][0];
    await act(async () => {
      await continueImport();
    });

    expect(store.get(contentViewAtom)).toBeNull();
    expect(store.get(dialogAtom)).toEqual({ type: "welcome" });
  });
});

const renderCommand = () => {
  const store = createStore();
  store.set(dialogAtom, { type: "welcome" });
  const { result } = renderHook(() => useOpenModelBuilder(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
  return { store, result };
};
