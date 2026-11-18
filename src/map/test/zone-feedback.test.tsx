import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { Provider } from "jotai";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { setInitialState } from "src/__helpers__/state";
import { USelection } from "src/selection";
import { hoveredAssetIdAtom } from "src/state/asset-hover";
import { hoveredZoneIdAtom } from "src/state/map-hover";
import { useSymbologyState } from "src/state/map-symbology";
import { Mode, modeAtom } from "src/state/mode";
import { selectionAtom } from "src/state/selection";
import { renderMap } from "./__helpers__/map";
import {
  fireMapClick,
  fireMapDown,
  fireMapMove,
  getSourceFeatures,
  stubSnapping,
} from "./__helpers__/map-engine-mock";
import type { MapTestEngine } from "./__helpers__/map-engine-mock";

vi.mock("src/hooks/use-is-edition-blocked", () => ({
  useIsEditionBlocked: () => false,
}));

const IDS = { Z1: 1, Z2: 2, J1: 3 } as const;
const FIRST = { lng: 0.5, lat: 0.5 };
const SECOND = { lng: 4.5, lat: 0.5 };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("zone feedback", () => {
  it("keeps a selected zone outlined while hovering another without rebuilding geometry", async () => {
    const { store, map, filters } = await mountMap();
    const snapshot = getSourceFeatures(map, "main-features");
    const editions = getSourceFeatures(map, "delta-features");
    const zones = getSourceFeatures(map, "zones");
    const selection = store.get(selectionAtom);

    await movePointer(map, FIRST);

    await waitFor(() => {
      expect(store.get(hoveredZoneIdAtom)).toBe(IDS.Z1);
      expect(filters.get("zones-hover-outline")).toEqual(zoneFilter([IDS.Z1]));
      expect(filters.get("zones-hover-contrast")).toEqual(zoneFilter([IDS.Z1]));
    });
    expect(store.get(selectionAtom)).toBe(selection);
    await fireMapClick(map, FIRST);
    await waitFor(() => {
      expect(USelection.getZoneIds(store.get(selectionAtom))).toEqual([IDS.Z1]);
      expect(filters.get("zones-selected-outline")).toEqual(
        zoneFilter([IDS.Z1]),
      );
      expect(filters.get("zones-selected-contrast")).toEqual(
        zoneFilter([IDS.Z1]),
      );
    });

    await movePointer(map, SECOND);

    await waitFor(() => {
      expect(store.get(hoveredZoneIdAtom)).toBe(IDS.Z2);
      expect(filters.get("zones-hover-outline")).toEqual(zoneFilter([IDS.Z2]));
    });
    expect(USelection.getZoneIds(store.get(selectionAtom))).toEqual([IDS.Z1]);
    await movePointer(map, { lng: 10, lat: 10 });
    await waitFor(() => {
      expect(store.get(hoveredZoneIdAtom)).toBeNull();
      expect(filters.get("zones-hover-outline")).toEqual(zoneFilter([]));
      expect(filters.get("zones-hover-contrast")).toEqual(zoneFilter([]));
    });
    expect(filters.get("zones-selected-outline")).toEqual(zoneFilter([IDS.Z1]));
    expect(getSourceFeatures(map, "main-features")).toBe(snapshot);
    expect(getSourceFeatures(map, "delta-features")).toBe(editions);
    expect(getSourceFeatures(map, "zones")).toBe(zones);
  });

  it("gives a node inside a zone priority for hover and selection", async () => {
    const { store, map, filters } = await mountMap();
    await movePointer(map, FIRST);
    await waitFor(() => expect(store.get(hoveredZoneIdAtom)).toBe(IDS.Z1));
    stubSnapping(map, [IDS.J1]);

    await movePointer(map, { lng: 1, lat: 1 });

    await waitFor(() => {
      expect(store.get(hoveredAssetIdAtom)).toBe(IDS.J1);
      expect(store.get(hoveredZoneIdAtom)).toBeNull();
      expect(filters.get("zones-hover-outline")).toEqual(zoneFilter([]));
    });
    await fireMapClick(map, { lng: 1, lat: 1 });
    expect(USelection.singleAssetId(store.get(selectionAtom))).toBe(IDS.J1);
    expect(USelection.getZoneIds(store.get(selectionAtom))).toEqual([]);
  });

  it("hides zone feedback with zones and stops picking hidden zones", async () => {
    const { store, map } = await mountMap();
    const hideLayers = vi.spyOn(map, "hideLayers");
    await movePointer(map, FIRST);
    await waitFor(() => expect(store.get(hoveredZoneIdAtom)).toBe(IDS.Z1));
    const { result } = renderHook(() => useSymbologyState(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    act(() => result.current.updateZoneSymbology({ visible: false }));

    await waitFor(() =>
      expect(hideLayers).toHaveBeenCalledWith(
        expect.arrayContaining([
          "zones-selected-contrast",
          "zones-selected-outline",
          "zones-hover-contrast",
          "zones-hover-outline",
        ]),
      ),
    );
    await movePointer(map, SECOND);
    await waitFor(() => expect(store.get(hoveredZoneIdAtom)).toBeNull());
    await fireMapClick(map, SECOND);
    expect(USelection.isNone(store.get(selectionAtom))).toBe(true);
  });

  it.each(["map boundary", "mode change", "pointer down"])(
    "clears zone hover at %s while retaining selection",
    async (action) => {
      const { store, map, filters } = await mountMap();
      await fireMapClick(map, FIRST);
      await movePointer(map, SECOND);
      await waitFor(() => expect(store.get(hoveredZoneIdAtom)).toBe(IDS.Z2));

      if (action === "map boundary") {
        fireEvent.mouseLeave(screen.getByTestId("map"));
      } else if (action === "mode change") {
        act(() => store.set(modeAtom, { mode: Mode.DRAW_JUNCTION }));
      } else {
        await fireMapDown(map, SECOND);
      }

      await waitFor(() => {
        expect(store.get(hoveredZoneIdAtom)).toBeNull();
        expect(filters.get("zones-hover-outline")).toEqual(zoneFilter([]));
        expect(filters.get("zones-hover-contrast")).toEqual(zoneFilter([]));
      });
      expect(USelection.getZoneIds(store.get(selectionAtom))).toEqual([IDS.Z1]);
      expect(filters.get("zones-selected-outline")).toEqual(
        zoneFilter([IDS.Z1]),
      );
    },
  );
});

const mountMap = async () => {
  const hydraulicModel = HydraulicModelBuilder.with()
    .aJunction(IDS.J1, { coordinates: [1, 1] })
    .aZone({ id: IDS.Z1, label: String(IDS.Z1), ...square(0) })
    .aZone({ id: IDS.Z2, label: String(IDS.Z2), ...square(4) })
    .build();
  const store = setInitialState({ hydraulicModel });
  const map = await renderMap(store);
  await waitFor(() => {
    expect(getSourceFeatures(map, "main-features")).toHaveLength(1);
    expect(getSourceFeatures(map, "zones")).toHaveLength(2);
  });
  const filters = new Map<string, unknown>();
  vi.spyOn(map, "setLayerFilter").mockImplementation((...args: unknown[]) => {
    const [layerId, filter] = args;
    if (typeof layerId === "string") filters.set(layerId, filter);
  });
  return { store, map, filters };
};

const square = (x: number) => ({
  geometry: {
    type: "MultiPolygon" as const,
    coordinates: [
      [
        [
          [x, 0],
          [x + 2, 0],
          [x + 2, 2],
          [x, 2],
          [x, 0],
        ],
      ],
    ],
  },
  bbox: [x, 0, x + 2, 2] as [number, number, number, number],
});

const zoneFilter = (ids: readonly number[]) => [
  "in",
  ["get", "id"],
  ["literal", [...ids]],
];

const movePointer = async (
  map: MapTestEngine,
  point: { lng: number; lat: number },
) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await fireMapMove(map, point);
};
