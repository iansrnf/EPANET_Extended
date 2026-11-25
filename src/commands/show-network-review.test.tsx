import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { setInitialState } from "src/__helpers__/state";
import { stubUserTracking } from "src/__helpers__/user-tracking";
import { CheckType } from "src/lib/network-review";
import { splitsAtom } from "src/state/layout";
import { createAssetTablePanel } from "src/panels/data-tables/create-panel";
import {
  networkReviewOpenAtom,
  selectedReviewCheckAtom,
} from "src/state/network-review";
import {
  activatePanelAtom,
  activePanelIn,
  panelsAtom,
  panelLayoutAtom,
} from "src/state/panels";
import {
  useSetNetworkReviewOpen,
  useShowNetworkReview,
} from "./show-network-review";

beforeEach(() => {
  stubUserTracking();
});

describe("useShowNetworkReview", () => {
  it.each([false, true])(
    "opens the map review without changing the left dock when open is %s",
    (leftOpen) => {
      const store = setInitialState();
      store.set(panelsAtom, [
        createAssetTablePanel("junction", { id: "neighbour" }),
      ]);
      store.set(panelLayoutAtom, { neighbour: { movedToDock: "left" } });
      store.set(activatePanelAtom, "neighbour");
      store.set(splitsAtom, (splits) => ({ ...splits, leftOpen }));
      const splits = store.get(splitsAtom);
      const panels = store.get(panelsAtom);
      const panelLayout = store.get(panelLayoutAtom);
      const { result } = renderHook(() => useShowNetworkReview(), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      act(() => result.current({ source: "auto" }));

      expect(store.get(networkReviewOpenAtom)).toBe(true);
      expect(store.get(splitsAtom)).toBe(splits);
      expect(store.get(panelsAtom)).toBe(panels);
      expect(store.get(panelLayoutAtom)).toBe(panelLayout);
      expect(store.get(activePanelIn("left"))?.id).toBe("neighbour");
    },
  );

  it("preserves the simulation target and records automatic opening", () => {
    const userTracking = stubUserTracking();
    const store = setInitialState();
    store.set(selectedReviewCheckAtom, CheckType.modelAttributesValidation);
    const { result } = renderHook(() => useShowNetworkReview(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    act(() => result.current({ source: "auto" }));

    expect(store.get(networkReviewOpenAtom)).toBe(true);
    expect(store.get(selectedReviewCheckAtom)).toBe(
      CheckType.modelAttributesValidation,
    );
    expect(userTracking.capture).toHaveBeenCalledWith({
      name: "networkReview.opened",
      source: "auto",
    });
  });
});

describe("useSetNetworkReviewOpen", () => {
  it("records one map event per opening transition", () => {
    const userTracking = stubUserTracking();
    const store = setInitialState();
    const { result } = renderHook(() => useSetNetworkReviewOpen(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    act(() => {
      result.current(true);
      result.current(true);
    });

    expect(store.get(networkReviewOpenAtom)).toBe(true);
    expect(userTracking.capture).toHaveBeenCalledTimes(1);
    expect(userTracking.capture).toHaveBeenCalledWith({
      name: "networkReview.opened",
      source: "map",
    });

    act(() => {
      result.current(false);
      result.current(true);
    });

    expect(userTracking.capture).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    "clears a pending target on close when open is %s",
    (open) => {
      const userTracking = stubUserTracking();
      const store = setInitialState();
      store.set(networkReviewOpenAtom, open);
      store.set(selectedReviewCheckAtom, "summary");
      const { result } = renderHook(() => useSetNetworkReviewOpen(), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      act(() => result.current(false));

      expect(store.get(networkReviewOpenAtom)).toBe(false);
      expect(store.get(selectedReviewCheckAtom)).toBeNull();
      expect(userTracking.capture).not.toHaveBeenCalled();
    },
  );
});
