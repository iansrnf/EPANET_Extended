import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { setInitialState } from "src/__helpers__/state";
import { stubUserTracking } from "src/__helpers__/user-tracking";
import { isNarrowViewportAtom, splitsAtom } from "src/state/layout";
import { createAssetPanel } from "src/panels/asset-panel/create-panel";
import { createMapStylingPanel } from "src/panels/map-styling-editor/create-panel";
import { activePanelIn, panelLayoutAtom, panelsAtom } from "src/state/panels";
import { selectionAtom } from "src/state/selection";
import { USelection } from "src/selection";
import { Store } from "src/state";
import { CommandContainer } from "./__helpers__/command-container";
import { useShowAssetPanel } from "./show-asset-panel";

const IDS = { J1: 1 } as const;

const aStore = () =>
  setInitialState({
    hydraulicModel: HydraulicModelBuilder.with().aJunction(IDS.J1).build(),
  });

beforeEach(() => {
  stubUserTracking();
});

describe("useShowAssetPanel", () => {
  it("opens the side bar holding the asset panel", async () => {
    const store = aStore();
    store.set(panelsAtom, [createAssetPanel(), createMapStylingPanel()]);
    store.set(splitsAtom, { ...store.get(splitsAtom), rightOpen: false });

    await show(store);

    expect(store.get(splitsAtom).rightOpen).toBe(true);
  });

  it("shows a single asset without opening the sidebar", async () => {
    const store = aStore();
    store.set(panelsAtom, [createAssetPanel(), createMapStylingPanel()]);
    store.set(selectionAtom, USelection.singleAsset(IDS.J1));

    await show(store);

    expect(store.get(activePanelIn("floating"))?.id).toEqual("asset");
    expect(store.get(splitsAtom).rightOpen).toBe(false);
  });

  it("opens the actual dock after the asset inspector was moved", async () => {
    const store = aStore();
    store.set(panelsAtom, [createAssetPanel()]);
    store.set(panelLayoutAtom, { asset: { movedToDock: "left" } });

    await show(store);

    expect(store.get(splitsAtom).leftOpen).toBe(true);
    expect(store.get(splitsAtom).rightOpen).toBe(false);
  });

  it("opens the vertical dock when explicitly showing an empty inspector", async () => {
    const store = aStore();
    store.set(panelsAtom, [createAssetPanel()]);
    store.set(isNarrowViewportAtom, true);
    store.set(splitsAtom, { ...store.get(splitsAtom), verticalOpen: false });

    await show(store);

    expect(store.get(splitsAtom).verticalOpen).toBe(true);
    expect(store.get(splitsAtom).rightOpen).toBe(false);
  });
});

const Trigger = () => {
  const showAssetPanel = useShowAssetPanel();
  return (
    <button
      aria-label="show"
      onClick={() => showAssetPanel({ source: "draw" })}
    >
      Show
    </button>
  );
};

const show = async (store: Store) => {
  render(
    <CommandContainer store={store}>
      <Trigger />
    </CommandContainer>,
  );
  await userEvent.click(screen.getByRole("button", { name: "show" }));
};
