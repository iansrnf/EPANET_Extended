import { act, render, screen } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import { vi } from "vitest";
import { contentViewAtom } from "src/state/content-view";
import { ModelBuildView } from "./model-build-view";
import { modelBuilderUrl } from "src/global-config";

vi.mock("src/global-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/global-config")>()),
  isModelBuilderEmbedded: true,
}));

vi.mock("src/hooks/use-feature-flags", () => ({
  useEnabledFeatureFlags: () => [],
  useFeatureFlag: () => false,
  useReportFeatureFlagUsage: () => () => {},
}));
vi.mock("src/commands/open-project", () => ({
  useOpenProjectFile: () => vi.fn(),
}));
vi.mock("src/commands/save-project", () => ({
  projectExtension: ".ejsdb",
}));
vi.mock("src/commands/show-network-review", () => ({
  useShowNetworkReview: () => vi.fn(),
}));
vi.mock("src/infra/user-tracking", () => ({
  useUserTracking: () => ({ capture: vi.fn() }),
}));

const postStepFromModelBuilder = (step: string) => {
  const iframe = screen.getByTitle<HTMLIFrameElement>("Import from GIS");
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: new URL(modelBuilderUrl).origin,
      source: iframe.contentWindow,
      data: {
        type: "contextChanged",
        data: { source: "epanet-model-builder", context: { step } },
      },
    }),
  );
};

describe("ModelBuildView", () => {
  it("does not reopen on a step change sent after exiting", () => {
    const store = createStore();
    store.set(contentViewAtom, { type: "modelBuild", step: null });
    render(
      <JotaiProvider store={store}>
        <ModelBuildView />
      </JotaiProvider>,
    );

    act(() => postStepFromModelBuilder("dataSources"));
    expect(store.get(contentViewAtom)).toEqual({
      type: "modelBuild",
      step: "dataSources",
    });

    act(() => store.set(contentViewAtom, null));
    act(() => postStepFromModelBuilder("layerAssignment"));

    expect(store.get(contentViewAtom)).toBeNull();
  });
});
