import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { setInitialState } from "src/__helpers__/state";
import { USelection } from "src/selection";
import { hoveredAssetIdAtom } from "src/state/asset-hover";
import { selectionAtom } from "src/state/selection";
import { Mode, modeAtom } from "src/state/mode";
import { projectSettingsAtom } from "src/state/project-settings";
import { LOGGER_LAYER_ID } from "src/map/overlays/loggers";
import { renderMap } from "./__helpers__/map";
import {
  fireMapClick,
  fireMapDown,
  fireMapMove,
  getSourceFeatures,
  stubNoSnapping,
  stubSnapping,
} from "./__helpers__/map-engine-mock";
import type { MapTestEngine } from "./__helpers__/map-engine-mock";

let isEditionBlocked = false;
vi.mock("src/hooks/use-is-edition-blocked", () => ({
  useIsEditionBlocked: () => isEditionBlocked,
}));

const IDS = { J1: 1, J2: 2, PIPE: 3, LOGGER: "1" } as const;
const FIRST = { lng: 1, lat: 1 };
const SECOND = { lng: 4, lat: 1 };

afterEach(() => {
  cleanup();
  isEditionBlocked = false;
  vi.clearAllMocks();
});

describe("asset hover feedback", () => {
  it("moves feedback between a node and pipe without selecting or rebuilding the network", async () => {
    const { store, map } = await mountMap();
    const snapshot = getSourceFeatures(map, "main-features");
    const editions = getSourceFeatures(map, "delta-features");
    const selection = store.get(selectionAtom);
    stubSnapping(map, [IDS.J1]);

    await movePointer(map, FIRST);

    await waitFor(() => {
      expect(store.get(hoveredAssetIdAtom)).toBe(IDS.J1);
      expect(getSourceFeatures(map, "asset-hover")).toEqual([
        expect.objectContaining({
          geometry: { type: "Point", coordinates: [FIRST.lng, FIRST.lat] },
        }),
      ]);
    });

    const nodeFeedback = getSourceFeatures(map, "asset-hover");
    await movePointer(map, FIRST);
    expect(getSourceFeatures(map, "asset-hover")).toBe(nodeFeedback);

    map.map.queryRenderedFeatures.mockReturnValue([aPipe()]);
    await movePointer(map, { lng: 2, lat: 1 });

    await waitFor(() => {
      expect(store.get(hoveredAssetIdAtom)).toBe(IDS.PIPE);
      expect(getSourceFeatures(map, "asset-hover")).toEqual([
        expect.objectContaining({
          geometry: {
            type: "LineString",
            coordinates: [
              [FIRST.lng, FIRST.lat],
              [SECOND.lng, SECOND.lat],
            ],
          },
        }),
      ]);
    });
    expect(store.get(selectionAtom)).toBe(selection);
    expect(USelection.isNone(store.get(selectionAtom))).toBe(true);
    expect(getSourceFeatures(map, "main-features")).toBe(snapshot);
    expect(getSourceFeatures(map, "delta-features")).toBe(editions);
  });

  it("uses visible node priority over pipes like click selection", async () => {
    const { store, map } = await mountMap();
    map.map.queryRenderedFeatures.mockReturnValue([
      aPipe(),
      aPoint(IDS.J1, true),
      aPoint(IDS.J2),
    ]);

    await movePointer(map, SECOND);

    await waitFor(() => expect(store.get(hoveredAssetIdAtom)).toBe(IDS.J2));

    map.map.queryRenderedFeatures.mockReturnValue([
      aPipe(),
      aPoint(IDS.J1, true),
    ]);
    await movePointer(map, FIRST);

    await waitFor(() => expect(store.get(hoveredAssetIdAtom)).toBe(IDS.PIPE));
  });

  it.each(["blank map", "map boundary"])(
    "clears feedback at the %s",
    async (target) => {
      const { store, map } = await mountMap();
      stubSnapping(map, [IDS.J1]);
      await movePointer(map, FIRST);
      await waitFor(() =>
        expect(getSourceFeatures(map, "asset-hover")).toHaveLength(1),
      );

      if (target === "blank map") {
        stubNoSnapping(map);
        await movePointer(map, { lng: 10, lat: 10 });
      } else {
        fireEvent.mouseLeave(screen.getByTestId("map"));
      }

      await waitFor(() => {
        expect(store.get(hoveredAssetIdAtom)).toBeNull();
        expect(getSourceFeatures(map, "asset-hover")).toEqual([]);
      });
    },
  );

  it.each(["mode change", "pointer down"])(
    "clears feedback before a %s",
    async (action) => {
      const { store, map } = await mountMap();
      stubSnapping(map, [IDS.J1]);
      await movePointer(map, FIRST);
      await waitFor(() =>
        expect(getSourceFeatures(map, "asset-hover")).toHaveLength(1),
      );

      if (action === "mode change") {
        act(() => store.set(modeAtom, { mode: Mode.DRAW_JUNCTION }));
      } else {
        await fireMapDown(map, FIRST);
      }

      await waitFor(() => {
        expect(store.get(hoveredAssetIdAtom)).toBeNull();
        expect(getSourceFeatures(map, "asset-hover")).toEqual([]);
      });
    },
  );

  it("keeps hover feedback available in read-only models", async () => {
    isEditionBlocked = true;
    const { store, map } = await mountMap();
    stubSnapping(map, [IDS.J1]);

    await movePointer(map, FIRST);

    await waitFor(() => {
      expect(store.get(hoveredAssetIdAtom)).toBe(IDS.J1);
      expect(getSourceFeatures(map, "asset-hover")).toHaveLength(1);
    });
    expect(USelection.isNone(store.get(selectionAtom))).toBe(true);
  });

  it("keeps a clicked pipe selected while another asset is hovered", async () => {
    const { store, map } = await mountMap();
    map.map.queryRenderedFeatures.mockReturnValue([aPipe()]);
    await fireMapClick(map, { lng: 2, lat: 1 });
    await waitFor(() =>
      expect([
        ...getSourceFeatures(map, "main-features"),
        ...getSourceFeatures(map, "delta-features"),
      ]).toContainEqual(
        expect.objectContaining({
          properties: expect.objectContaining({ type: "pipe", selected: true }),
        }),
      ),
    );
    const selectedSnapshot = getSourceFeatures(map, "main-features");
    const selectedEditions = getSourceFeatures(map, "delta-features");
    expect(USelection.getAssetIds(store.get(selectionAtom))).toEqual([
      IDS.PIPE,
    ]);
    expect(
      [...selectedSnapshot, ...selectedEditions].filter(
        ({ properties }) =>
          properties?.type === "junction" && properties.selected === true,
      ),
    ).toEqual([]);
    stubSnapping(map, [IDS.J2]);

    await movePointer(map, SECOND);

    await waitFor(() => expect(store.get(hoveredAssetIdAtom)).toBe(IDS.J2));
    expect(USelection.singleAssetId(store.get(selectionAtom))).toBe(IDS.PIPE);
    expect(getSourceFeatures(map, "main-features")).toBe(selectedSnapshot);
    expect(getSourceFeatures(map, "delta-features")).toBe(selectedEditions);
  });

  it("clears underlying asset feedback when a logger takes pointer priority", async () => {
    const { store, map } = await mountMap();
    stubSnapping(map, [IDS.J1]);
    await movePointer(map, FIRST);
    await waitFor(() => expect(store.get(hoveredAssetIdAtom)).toBe(IDS.J1));
    act(() => {
      store.set(projectSettingsAtom, {
        ...store.get(projectSettingsAtom),
        loggers: [
          {
            id: IDS.LOGGER,
            label: "Logger",
            coordinates: [FIRST.lng, FIRST.lat],
            connection: null,
          },
        ],
      });
    });
    map.pickOverlayObjects.mockReturnValue([
      { layer: { id: LOGGER_LAYER_ID }, object: { id: IDS.LOGGER } },
    ]);

    await movePointer(map, FIRST);

    await waitFor(() => {
      expect(store.get(hoveredAssetIdAtom)).toBeNull();
      expect(getSourceFeatures(map, "asset-hover")).toEqual([]);
    });
    expect(USelection.isNone(store.get(selectionAtom))).toBe(true);
  });
});

const mountMap = async () => {
  const hydraulicModel = HydraulicModelBuilder.with()
    .aJunction(IDS.J1, { coordinates: [FIRST.lng, FIRST.lat] })
    .aJunction(IDS.J2, { coordinates: [SECOND.lng, SECOND.lat] })
    .aPipe(IDS.PIPE, { startNodeId: IDS.J1, endNodeId: IDS.J2 })
    .build();
  const store = setInitialState({ hydraulicModel });
  const map = await renderMap(store);
  await waitFor(() => {
    expect(getSourceFeatures(map, "main-features")).toHaveLength(3);
    expect(getSourceFeatures(map, "asset-hover")).toEqual([]);
  });
  return { store, map };
};

const movePointer = async (
  map: MapTestEngine,
  point: { lng: number; lat: number },
) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await fireMapMove(map, point);
};

const aPoint = (id: number, hidden = false) => ({
  type: "Feature",
  id,
  properties: { type: "junction" },
  geometry: { type: "Point", coordinates: [FIRST.lng, FIRST.lat] },
  state: { hidden },
});

const aPipe = () => ({
  type: "Feature",
  id: IDS.PIPE,
  properties: { type: "pipe" },
  geometry: {
    type: "LineString",
    coordinates: [
      [FIRST.lng, FIRST.lat],
      [SECOND.lng, SECOND.lat],
    ],
  },
});
