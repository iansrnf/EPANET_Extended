import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import type { MapMouseEvent, Style } from "mapbox-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { setInitialState } from "src/__helpers__/state";
import { USelection } from "src/selection";
import { selectionAtom } from "src/state/selection";
import { renderMap } from "./__helpers__/map";
import type { MapTestEngine } from "./__helpers__/map-engine-mock";

vi.mock("@deck.gl/mapbox", () => ({ MapboxOverlay: class {} }));

vi.mock("src/map/overlays/customer-points", () => ({
  buildCustomerPointsOverlay: () => [],
  buildCustomerPointHoverOverlay: () => [],
  buildCustomerPointsHighlightOverlay: () => [],
  buildConnectCustomerPointsPreviewOverlay: () => [],
  buildMovingCustomerPointOverlay: () => [],
  applyCustomerPointsStyles: () => [],
  updateCustomerPointsOverlayVisibility: () => [],
}));

vi.mock("src/components/context-actions/geometry-actions", async () => {
  const menu = await import("@radix-ui/react-context-menu");
  return {
    GeometryActions: () => <menu.Item>Selected asset actions</menu.Item>,
  };
});

const IDS = { JUNCTION: 1 } as const;
const STYLE: Style = { version: 8, sources: {}, layers: [] };

beforeEach(() => {
  vi.stubGlobal("fetch", () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(STYLE) }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each([0, 60])("camera context menus at %d°", (pitch) => {
  it.each([true, false])(
    "keeps a stationary selected-asset menu when contextmenu arrives before release: %s",
    async (beforeRelease) => {
      const { map, canvas, nativeContextMenu } = await mountSelectedMap(pitch);
      startRightDrag(map, 100, 150);

      if (beforeRelease) {
        fireEvent.contextMenu(canvas, { clientX: 100, clientY: 150 });
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      }
      fireEvent.mouseUp(window, { button: 2, clientX: 100, clientY: 150 });
      if (!beforeRelease) {
        fireEvent.contextMenu(canvas, { clientX: 100, clientY: 150 });
      }

      expect(await screen.findByRole("menu")).toHaveTextContent(
        "Selected asset actions",
      );
      expect(nativeContextMenu).not.toHaveBeenCalled();
      expect(map.map.queryRenderedFeatures).toHaveBeenLastCalledWith(
        [100, 150],
        expect.objectContaining({ layers: expect.any(Array) }),
      );
    },
  );

  it("suppresses the dragged menu and allows the next stationary right-click", async () => {
    const { map, canvas, store, selection } = await mountSelectedMap(pitch);
    startRightDrag(map, 100, 150);
    fireEvent.mouseMove(window, {
      button: 2,
      buttons: 2,
      clientX: 100,
      clientY: 190,
    });
    fireEvent.mouseUp(window, { button: 2, clientX: 100, clientY: 190 });
    fireEvent.contextMenu(canvas, { clientX: 100, clientY: 190 });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(store.get(selectionAtom)).toBe(selection);
    expect(map.map.queryRenderedFeatures).not.toHaveBeenCalled();

    startRightDrag(map, 100, 190);
    fireEvent.mouseUp(window, { button: 2, clientX: 100, clientY: 190 });
    fireEvent.contextMenu(canvas, { clientX: 100, clientY: 190 });

    expect(await screen.findByRole("menu")).toHaveTextContent(
      "Selected asset actions",
    );
    expect(store.get(selectionAtom)).toBe(selection);
  });
});

const mountSelectedMap = async (pitch: number) => {
  const hydraulicModel = HydraulicModelBuilder.with()
    .aJunction(IDS.JUNCTION)
    .build();
  const store = setInitialState({ hydraulicModel });
  const map = await renderMap(store);
  if (pitch > 1) {
    fireEvent.click(screen.getByRole("button", { name: "3D view" }));
    await waitFor(() => expect(map.map.touchPitch.isEnabled()).toBe(true));
    act(() => {
      map.map.getPitch.mockReturnValue(pitch);
      for (const [event, listener] of map.map.on.mock.calls) {
        if (event === "pitch" || event === "pitchend") {
          (listener as () => void)();
        }
      }
    });
  }
  const selection = USelection.singleAsset(IDS.JUNCTION);
  act(() => {
    store.set(selectionAtom, selection);
  });
  await waitFor(() => expect(map.map.dragRotate.isEnabled()).toBe(true));

  Object.assign(map.map, {
    unproject: (position: number[]) => ({ toArray: () => position }),
  });
  map.map.queryRenderedFeatures.mockReturnValue([]).mockClear();
  const canvas = document.createElement("canvas");
  screen.getByTestId("map").appendChild(canvas);
  const nativeContextMenu = vi.fn((event: Event) => event.preventDefault());
  canvas.addEventListener("contextmenu", nativeContextMenu);
  return { map, canvas, nativeContextMenu, store, selection };
};

const startRightDrag = (
  map: MapTestEngine,
  clientX: number,
  clientY: number,
) => {
  act(() => {
    map.handlers.current.onMapMouseDown({
      originalEvent: new MouseEvent("mousedown", {
        button: 2,
        buttons: 2,
        clientX,
        clientY,
      }),
    } as MapMouseEvent);
  });
};
