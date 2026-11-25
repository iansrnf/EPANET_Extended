import { act, renderHook } from "@testing-library/react";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { setInitialState } from "src/__helpers__/state";
import { stubUserTracking } from "src/__helpers__/user-tracking";
import { CommandContainer } from "src/commands/__helpers__/command-container";
import { resolvePermissions } from "src/hooks/use-permissions";
import { newBookmark } from "src/lib/collections";
import type {
  ScriptOutputBookmark,
  ScriptOutputSelectionSet,
} from "src/lib/scripting";
import { USelection } from "src/selection";
import {
  bookmarksAtom,
  collectionsOpenAtom,
  pendingCollectionDraftAtom,
  selectionSetGroupsAtom,
  selectionSetsAtom,
} from "src/state/collections";
import { splitsAtom } from "src/state/layout";
import { panelsAtom } from "src/state/panels";
import { selectionAtom } from "src/state/selection";
import {
  useSaveAllScriptBookmarks,
  useSaveAllScriptSelectionSets,
  useSaveScriptSelectionSet,
} from "./script-output-collections";

vi.mock("src/hooks/use-permissions", async () => {
  const actual = await vi.importActual<
    typeof import("src/hooks/use-permissions")
  >("src/hooks/use-permissions");
  return {
    ...actual,
    usePermissions: () => resolvePermissions("pro", false, false, false),
  };
});

const IDS = { junction: 1, missing: 2 } as const;

const aStore = () =>
  setInitialState({
    hydraulicModel: HydraulicModelBuilder.with()
      .aJunction(IDS.junction)
      .build(),
  });

beforeEach(() => {
  stubUserTracking();
});

describe("script collections handoff", () => {
  it("opens a grouped draft with existing script targets without changing docks", () => {
    const store = aStore();
    const splits = store.get(splitsAtom);
    const panels = store.get(panelsAtom);
    const { result } = renderHook(() => useSaveScriptSelectionSet(), {
      wrapper: ({ children }) => (
        <CommandContainer store={store}>{children}</CommandContainer>
      ),
    });

    act(() =>
      result.current({
        label: "District/Night demand",
        targets: {
          assetIds: [IDS.junction, IDS.missing],
          customerPointIds: [],
        },
      }),
    );

    expect(USelection.getAssetIds(store.get(selectionAtom))).toEqual([
      IDS.junction,
    ]);
    expect(store.get(pendingCollectionDraftAtom)).toEqual({
      kind: "selectionSets",
      source: "script-output",
      groupLabels: ["District"],
      label: "Night demand",
    });
    expect(store.get(collectionsOpenAtom)).toBe(true);
    expect(store.get(splitsAtom)).toBe(splits);
    expect(store.get(panelsAtom)).toBe(panels);
  });

  it("opens collections after saving only uncommitted script sets", () => {
    const store = aStore();
    const { result } = renderHook(() => useSaveAllScriptSelectionSets(), {
      wrapper: ({ children }) => (
        <CommandContainer store={store}>{children}</CommandContainer>
      ),
    });
    const selectionSets: ScriptOutputSelectionSet[] = [
      {
        label: "Already saved",
        targets: { assetIds: [IDS.junction], customerPointIds: [] },
        commit: true,
      },
      {
        label: "District/Night demand",
        targets: {
          assetIds: [IDS.junction, IDS.missing],
          customerPointIds: [],
        },
        commit: false,
      },
    ];

    act(() => result.current(selectionSets));

    const saved = store.get(selectionSetsAtom);
    expect(saved).toHaveLength(1);
    expect(saved[0].label).toBe("Night demand");
    expect(USelection.getAssetIds(saved[0].selection)).toEqual([IDS.junction]);
    expect(store.get(selectionSetGroupsAtom)).toEqual([
      expect.objectContaining({ id: saved[0].groupId, label: "District" }),
    ]);
    expect(store.get(collectionsOpenAtom)).toBe(true);
    expect(store.get(pendingCollectionDraftAtom)).toBeNull();
  });

  it("keeps existing bookmarks and opens collections after a script bulk save", () => {
    const store = aStore();
    const existing = newBookmark("Existing", [0, 0, 1, 1]);
    store.set(bookmarksAtom, [existing]);
    const { result } = renderHook(() => useSaveAllScriptBookmarks(), {
      wrapper: ({ children }) => (
        <CommandContainer store={store}>{children}</CommandContainer>
      ),
    });
    const bookmarks: ScriptOutputBookmark[] = [
      { label: "Already saved", bbox: [0, 0, 1, 1], commit: true },
      { label: "Intake", bbox: [1, 1, 2, 2], commit: false },
    ];

    act(() => result.current(bookmarks));

    const saved = store.get(bookmarksAtom);
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual(existing);
    expect(saved[1]).toMatchObject({ label: "Intake", bbox: [1, 1, 2, 2] });
    expect(store.get(collectionsOpenAtom)).toBe(true);
    expect(store.get(pendingCollectionDraftAtom)).toBeNull();
  });
});
