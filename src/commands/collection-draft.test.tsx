import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setInitialState } from "src/__helpers__/state";
import { stubUserTracking } from "src/__helpers__/user-tracking";
import {
  resolvePermissions,
  type Permissions,
} from "src/hooks/use-permissions";
import { CommandContainer } from "src/commands/__helpers__/command-container";
import type { CollectionDraft } from "src/lib/collections";
import { createAssetTablePanel } from "src/panels/data-tables/create-panel";
import { Store } from "src/state";
import {
  collectionsOpenAtom,
  pendingCollectionDraftAtom,
} from "src/state/collections";
import { splitsAtom } from "src/state/layout";
import {
  activatePanelAtom,
  activePanelIn,
  panelsAtom,
  panelLayoutAtom,
} from "src/state/panels";
import { useStartCollectionDraft } from "./collection-draft";
import { useSetCollectionsOpen } from "./show-collections";

const permissionsRef: { current: Permissions } = {
  current: resolvePermissions("pro", false, false, false),
};

vi.mock("src/hooks/use-permissions", async () => {
  const actual = await vi.importActual<
    typeof import("src/hooks/use-permissions")
  >("src/hooks/use-permissions");
  return {
    ...actual,
    usePermissions: () => permissionsRef.current,
  };
});

const startUpgrade = vi.fn();
vi.mock("src/hooks/use-paywall", async () => {
  const actual = await vi.importActual<typeof import("src/hooks/use-paywall")>(
    "src/hooks/use-paywall",
  );
  return {
    ...actual,
    useStartUpgrade: () => startUpgrade,
  };
});

const aStore = () => {
  const store = setInitialState();
  store.set(panelsAtom, [
    createAssetTablePanel("junction", { id: "neighbour" }),
  ]);
  store.set(panelLayoutAtom, { neighbour: { movedToDock: "left" } });
  store.set(activatePanelAtom, "neighbour");
  return store;
};

const Trigger = ({ draft }: { draft: CollectionDraft }) => {
  const startCollectionDraft = useStartCollectionDraft();
  return (
    <button aria-label="start" onClick={() => startCollectionDraft(draft)}>
      Start
    </button>
  );
};

const start = async (store: Store, draft: CollectionDraft) => {
  render(
    <CommandContainer store={store}>
      <Trigger draft={draft} />
    </CommandContainer>,
  );
  await userEvent.click(screen.getByRole("button", { name: "start" }));
};

beforeEach(() => {
  stubUserTracking();
  startUpgrade.mockClear();
  permissionsRef.current = resolvePermissions("pro", false, false, false);
});

describe("useStartCollectionDraft", () => {
  it.each([false, true])(
    "opens collections without changing the dock when open is %s",
    async (leftOpen) => {
      const store = aStore();
      store.set(splitsAtom, (splits) => ({ ...splits, leftOpen, left: 555 }));
      const splits = store.get(splitsAtom);
      const panels = store.get(panelsAtom);
      const panelLayout = store.get(panelLayoutAtom);

      await start(store, {
        kind: "selectionSets",
        source: "context-menu",
        label: "",
      });

      expect(store.get(collectionsOpenAtom)).toBe(true);
      expect(store.get(splitsAtom)).toBe(splits);
      expect(store.get(panelsAtom)).toBe(panels);
      expect(store.get(panelLayoutAtom)).toBe(panelLayout);
      expect(store.get(activePanelIn("left"))?.id).toBe("neighbour");
    },
  );

  it.each<CollectionDraft>([
    {
      kind: "bookmarks",
      source: "collections-add-row",
      label: "Intake",
    },
    {
      kind: "selectionSets",
      source: "collections-group",
      label: "Night demand",
      groupId: "district",
      groupLabels: ["District", "Night"],
    },
  ])("preserves the $kind draft handoff", async (draft) => {
    const store = aStore();

    await start(store, draft);

    expect(store.get(pendingCollectionDraftAtom)).toEqual(draft);
  });

  it("shows the popup instead of a draft without a plan", async () => {
    permissionsRef.current = resolvePermissions("free", false, false, false);
    const store = aStore();
    store.set(splitsAtom, (splits) => ({ ...splits, leftOpen: false }));
    const splits = store.get(splitsAtom);

    await start(store, {
      kind: "selectionSets",
      source: "context-menu",
      label: "",
    });

    expect(store.get(collectionsOpenAtom)).toBe(true);
    expect(store.get(splitsAtom)).toBe(splits);
    expect(store.get(activePanelIn("left"))?.id).toBe("neighbour");
    expect(startUpgrade).not.toHaveBeenCalled();
    expect(store.get(pendingCollectionDraftAtom)).toBeNull();
  });

  it("offers an upgrade when the popup is already on screen", async () => {
    permissionsRef.current = resolvePermissions("free", false, false, false);
    const store = aStore();
    store.set(collectionsOpenAtom, true);

    await start(store, {
      kind: "selectionSets",
      source: "context-menu",
      label: "",
    });

    expect(startUpgrade).toHaveBeenCalledWith("selectionSets");
    expect(store.get(pendingCollectionDraftAtom)).toBeNull();
  });
});

describe("useSetCollectionsOpen", () => {
  it.each([false, true])(
    "clears pending drafts on close when open is %s",
    (open) => {
      const store = aStore();
      store.set(collectionsOpenAtom, open);
      store.set(pendingCollectionDraftAtom, {
        kind: "selectionSets",
        source: "toolbar",
        label: "Draft",
      });
      const { result } = renderHook(() => useSetCollectionsOpen(), {
        wrapper: ({ children }) => (
          <CommandContainer store={store}>{children}</CommandContainer>
        ),
      });

      act(() => result.current(false));

      expect(store.get(collectionsOpenAtom)).toBe(false);
      expect(store.get(pendingCollectionDraftAtom)).toBeNull();
    },
  );
});
