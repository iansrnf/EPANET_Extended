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
import { selectionAtom } from "src/state/selection";
import { hoveredCustomerPointIdAtom } from "src/state/map-hover";
import { ephemeralStateAtom } from "src/state/drawing";
import { stagingModelDerivedAtom } from "src/state/derived-branch-state";
import { Mode, modeAtom } from "src/state/mode";
import { currentZoomAtom } from "src/state/map";
import { renderMap } from "./__helpers__/map";
import {
  fireMapClick,
  fireMapDown,
  fireMapMove,
  fireMapUp,
  getSourceFeatures,
} from "./__helpers__/map-engine-mock";
import type { MapTestEngine } from "./__helpers__/map-engine-mock";

const IDS = { J1: 1, J2: 2, PIPE: 3, CP1: 4, CP2: 5 } as const;
const FIRST = { lng: 2, lat: 1 };
const SECOND = { lng: 4, lat: 1 };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("customer point feedback", () => {
  it("hovers one point and preserves selection without rebuilding customer or network geometry", async () => {
    const { map, store, hydraulicModel } = await mountMap();
    const base = overlayProps(map, "customer-points-layer");
    const customerData = base.data;
    const connections = overlayProps(
      map,
      "customer-connection-lines-layer",
    ).data;
    const snapshot = getSourceFeatures(map, "main-features");
    const editions = getSourceFeatures(map, "delta-features");
    const first = customerData.find(({ id }) => id === IDS.CP1)!;
    const second = customerData.find(({ id }) => id === IDS.CP2)!;
    const firstFill = base.getFillColor(first);
    const secondFill = base.getFillColor(second);
    const selection = store.get(selectionAtom);
    pickCustomer(map, hydraulicModel.customerPoints.get(IDS.CP1)!);

    await movePointer(map, FIRST);

    await waitFor(() => {
      expect(store.get(hoveredCustomerPointIdAtom)).toBe(IDS.CP1);
      expect(overlayProps(map, "customer-point-hover-ring").data).toEqual([
        hydraulicModel.customerPoints.get(IDS.CP1),
      ]);
    });
    expect(store.get(selectionAtom)).toBe(selection);
    expect(overlayProps(map, "customer-points-layer").data).toBe(customerData);
    expect(overlayProps(map, "customer-connection-lines-layer").data).toBe(
      connections,
    );
    expect(getSourceFeatures(map, "main-features")).toBe(snapshot);
    expect(getSourceFeatures(map, "delta-features")).toBe(editions);

    await fireMapClick(map, FIRST);
    pickCustomer(map, hydraulicModel.customerPoints.get(IDS.CP2)!);
    await movePointer(map, SECOND);

    await waitFor(() => {
      expect(store.get(hoveredCustomerPointIdAtom)).toBe(IDS.CP2);
      expect(USelection.singleCustomerPointId(store.get(selectionAtom))).toBe(
        IDS.CP1,
      );
      expect(overlayProps(map, "customer-point-hover-ring").data).toEqual([
        hydraulicModel.customerPoints.get(IDS.CP1),
        hydraulicModel.customerPoints.get(IDS.CP2),
      ]);
      const selected = overlayProps(map, "customer-points-layer");
      expect(selected.getLineColor(first)).toEqual([255, 255, 255, 255]);
      expect(selected.getLineWidth(first)).toBeGreaterThan(
        selected.getLineWidth(second),
      );
      expect(selected.getFillColor(first)).toEqual(firstFill);
      expect(selected.getFillColor(second)).toEqual(secondFill);
    });
    expect(overlayProps(map, "customer-points-layer").data).toBe(customerData);
    expect(USelection.getAssetIds(store.get(selectionAtom))).toEqual([]);
    map.pickOverlayObjects.mockReturnValue([]);
    await movePointer(map, { lng: 20, lat: 20 });
    await waitFor(() => {
      expect(store.get(hoveredCustomerPointIdAtom)).toBeNull();
      expect(overlayProps(map, "customer-point-hover-ring").data).toEqual([
        hydraulicModel.customerPoints.get(IDS.CP1),
      ]);
    });
    expect(USelection.singleCustomerPointId(store.get(selectionAtom))).toBe(
      IDS.CP1,
    );
  });

  it.each(["boundary", "mode", "pointer down"])(
    "clears point hover at %s without clearing the selected point",
    async (action) => {
      const { map, store, hydraulicModel } = await mountMap();
      pickCustomer(map, hydraulicModel.customerPoints.get(IDS.CP1)!);
      await fireMapClick(map, FIRST);
      await movePointer(map, FIRST);
      await waitFor(() =>
        expect(store.get(hoveredCustomerPointIdAtom)).toBe(IDS.CP1),
      );

      if (action === "boundary")
        fireEvent.mouseLeave(screen.getByTestId("map"));
      else if (action === "mode")
        act(() => store.set(modeAtom, { mode: Mode.DRAW_PIPE }));
      else await fireMapDown(map, FIRST);

      await waitFor(() =>
        expect(store.get(hoveredCustomerPointIdAtom)).toBeNull(),
      );
      expect(USelection.singleCustomerPointId(store.get(selectionAtom))).toBe(
        IDS.CP1,
      );
    },
  );

  it("moves the selected point feedback with the preview and committed point", async () => {
    const { map, store, hydraulicModel } = await mountMap();
    pickCustomer(map, hydraulicModel.customerPoints.get(IDS.CP1)!);
    await fireMapClick(map, FIRST);
    await movePointer(map, FIRST);
    await fireMapDown(map, FIRST);
    const destination = { lng: 3, lat: 3 };

    await movePointer(map, destination);

    await waitFor(() => {
      expect(store.get(hoveredCustomerPointIdAtom)).toBeNull();
      expect(store.get(ephemeralStateAtom)).toMatchObject({
        type: "moveCustomerPoint",
        movedCoordinates: [destination.lng, destination.lat],
      });
      expect(
        overlayProps(map, "moving-customer-point-ring-layer").data,
      ).toEqual([{ coordinates: [destination.lng, destination.lat] }]);
    });
    await fireMapUp(map, destination);
    await waitFor(() => {
      expect(
        store.get(stagingModelDerivedAtom).customerPoints.get(IDS.CP1)
          ?.coordinates,
      ).toEqual([destination.lng, destination.lat]);
      expect(overlayProps(map, "customer-points-layer").data).toContainEqual(
        expect.objectContaining({
          id: IDS.CP1,
          coordinates: [destination.lng, destination.lat],
        }),
      );
    });
  });
});

const mountMap = async () => {
  const hydraulicModel = HydraulicModelBuilder.with()
    .aJunction(IDS.J1, { coordinates: [0, 0] })
    .aJunction(IDS.J2, { coordinates: [10, 0] })
    .aPipe(IDS.PIPE, { startNodeId: IDS.J1, endNodeId: IDS.J2 })
    .aCustomerPoint(IDS.CP1, {
      coordinates: [FIRST.lng, FIRST.lat],
      connection: { pipeId: IDS.PIPE, junctionId: IDS.J1, snapPoint: [2, 0] },
    })
    .aCustomerPoint(IDS.CP2, { coordinates: [SECOND.lng, SECOND.lat] })
    .build();
  const store = setInitialState({ hydraulicModel });
  store.set(currentZoomAtom, 18);
  const map = await renderMap(store);
  await waitFor(() =>
    expect(overlayProps(map, "customer-points-layer").data).toHaveLength(2),
  );
  return { map, store, hydraulicModel };
};

const pickCustomer = (map: MapTestEngine, customerPoint: unknown) => {
  map.pickOverlayObjects.mockReturnValue([
    { layer: { id: "customer-points-layer" }, object: customerPoint },
  ]);
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

type Marker = { id: number; coordinates: number[]; isActive: boolean };
type OverlayProps = {
  data: Marker[];
  getFillColor: (marker: Marker) => number[];
  getLineColor: (marker: Marker) => number[];
  getLineWidth: (marker: Marker) => number;
};

const overlayProps = (map: MapTestEngine, layerId: string): OverlayProps => {
  const layers = map.setOverlay.mock.lastCall?.[0] as
    Array<{ id: string; props: OverlayProps }> | undefined;
  return (
    layers?.find((layer) => layer.id === layerId)?.props ??
    ({ data: [] } as unknown as OverlayProps)
  );
};
