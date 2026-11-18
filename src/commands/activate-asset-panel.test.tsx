import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { setInitialState } from "src/__helpers__/state";
import { stubUserTracking } from "src/__helpers__/user-tracking";
import { isNarrowViewportAtom, splitsAtom } from "src/state/layout";
import { createAssetPanel } from "src/panels/asset-panel/create-panel";
import { createMapStylingPanel } from "src/panels/map-styling-editor/create-panel";
import {
  activatePanelAtom,
  activePanelIn,
  panelLayoutAtom,
  panelsAtom,
} from "src/state/panels";
import { selectionAtom } from "src/state/selection";
import { Mode, modeAtom } from "src/state/mode";
import { USelection } from "src/selection";
import { createHglProfilePanel } from "src/panels/hgl-profile/create-panel";
import { Store } from "src/state";
import { CommandContainer } from "./__helpers__/command-container";
import { useActivateAssetPanel } from "./activate-asset-panel";

const IDS = { J1: 1, J2: 2, CP1: 3, Z1: 4 } as const;

const aStore = () =>
  setInitialState({
    hydraulicModel: HydraulicModelBuilder.with()
      .aJunction(IDS.J1)
      .aJunction(IDS.J2)
      .build(),
  });

beforeEach(() => {
  stubUserTracking();
});

describe("useActivateAssetPanel", () => {
  it("brings the asset panel forward over the map styling", async () => {
    const store = aStore();
    store.set(panelsAtom, [createAssetPanel(), createMapStylingPanel()]);
    store.set(activatePanelAtom, "map-styling");

    await activate(store);

    expect(store.get(activePanelIn("right"))?.id).toEqual("asset");
  });

  it("leaves an empty closed side bar closed", async () => {
    const store = aStore();
    store.set(panelsAtom, [createAssetPanel(), createMapStylingPanel()]);
    store.set(splitsAtom, { ...store.get(splitsAtom), rightOpen: false });

    await activate(store);

    expect(store.get(splitsAtom).rightOpen).toBe(false);
  });

  it.each([
    ["asset", USelection.singleAsset(IDS.J1)],
    ["customer point", USelection.singleCustomerPoint(IDS.CP1)],
    ["zone", USelection.singleZone(IDS.Z1)],
  ])(
    "deactivates the sidebar before showing a floating %s",
    async (_label, selection) => {
      const store = aStore();
      const profile = createHglProfilePanel();
      store.set(panelsAtom, [createAssetPanel(), profile]);
      store.set(panelLayoutAtom, { [profile.id]: { movedToDock: "right" } });
      store.set(splitsAtom, { ...store.get(splitsAtom), rightOpen: true });
      store.set(modeAtom, { mode: Mode.HGL_PROFILE });
      store.set(selectionAtom, selection);

      await activate(store);

      expect(store.get(activePanelIn("floating"))?.id).toEqual("asset");
      expect(store.get(splitsAtom).rightOpen).toBe(false);
      expect(store.get(modeAtom).mode).toEqual(Mode.NONE);
    },
  );

  it("opens the sidebar for a selection of multiple assets", async () => {
    const store = aStore();
    store.set(panelsAtom, [createAssetPanel(), createMapStylingPanel()]);
    store.set(selectionAtom, USelection.fromAssetIds([IDS.J1, IDS.J2]));
    store.set(splitsAtom, { ...store.get(splitsAtom), rightOpen: false });

    await activate(store);

    expect(store.get(splitsAtom).rightOpen).toBe(true);
    expect(store.get(activePanelIn("right"))?.id).toEqual("asset");
  });

  it.each([
    ["customer point", USelection.singleCustomerPoint(IDS.CP1)],
    ["zone", USelection.singleZone(IDS.Z1)],
  ])("floats a %s in a narrow viewport", async (_label, selection) => {
    const store = aStore();
    store.set(panelsAtom, [createAssetPanel()]);
    store.set(isNarrowViewportAtom, true);
    store.set(selectionAtom, selection);
    store.set(splitsAtom, {
      ...store.get(splitsAtom),
      rightOpen: false,
      verticalOpen: false,
    });

    await activate(store);

    expect(store.get(splitsAtom).verticalOpen).toBe(false);
    expect(store.get(splitsAtom).rightOpen).toBe(false);
    expect(store.get(activePanelIn("floating"))?.id).toEqual("asset");
  });
});

const Trigger = () => {
  const activateAssetPanel = useActivateAssetPanel();
  return (
    <button aria-label="activate" onClick={activateAssetPanel}>
      Activate
    </button>
  );
};

const activate = async (store: Store) => {
  render(
    <CommandContainer store={store}>
      <Trigger />
    </CommandContainer>,
  );
  await userEvent.click(screen.getByRole("button", { name: "activate" }));
};
