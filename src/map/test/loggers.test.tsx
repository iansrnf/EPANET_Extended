import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Provider } from "jotai";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { moveNode } from "@epanet-js/hydraulic-model-operations";
import type { Logger } from "@epanet-js/project-settings";
import { triggerShortcut } from "src/__helpers__/keyboard";
import { setInitialState } from "src/__helpers__/state";
import { projectSettingsAtom } from "src/state/project-settings";
import { loggersAtom, selectedLoggerIdAtom } from "src/state/loggers";
import { loggerPreviewAtom } from "src/state/logger-map";
import { Mode, modeAtom } from "src/state/mode";
import { stagingModelDerivedAtom } from "src/state/derived-branch-state";
import { modelFactoriesAtom } from "src/state/model-factories";
import { useModelTransaction } from "src/hooks/persistence/use-model-transaction";
import {
  LOGGER_LAYER_ID,
  LOGGER_PRESSURE_LAYER_ID,
} from "src/map/overlays/loggers";
import { loggerReadingsAtom } from "src/state/logger-stream";
import { localeAtom } from "src/state/locale";
import type { LoggerReading } from "src/lib/logger-stream";
import { renderMap } from "./__helpers__/map";
import {
  fireMapClick,
  fireMapDown,
  fireMapMove,
  fireMapUp,
} from "./__helpers__/map-engine-mock";
import type { MapTestEngine } from "./__helpers__/map-engine-mock";

let isEditionBlocked = false;
vi.mock("src/hooks/use-is-edition-blocked", () => ({
  useIsEditionBlocked: () => isEditionBlocked,
}));

const IDS = {
  LOGGER: "logger-1",
  JUNCTION: 10,
  TANK: 11,
  RESERVOIR: 12,
  PIPE: 13,
};
const logger: Logger = {
  id: IDS.LOGGER,
  label: "Logger 1",
  coordinates: [1, 1],
  connection: null,
};

afterEach(() => {
  cleanup();
  sessionStorage.removeItem("locale");
  isEditionBlocked = false;
  vi.clearAllMocks();
});

describe("loggers on the map", () => {
  it("retains the last pressure label across selection changes until a new reading arrives", async () => {
    const { store, map } = await mountLogger();
    const reading: LoggerReading = {
      deviceId: "L1",
      type: "pressure",
      timestamp: "2026-11-10T10:28:22",
      pressure: -0.250298,
      status: "online",
    };

    act(() => {
      store.set(localeAtom, "en");
      store.set(loggerReadingsAtom, new Map([[IDS.LOGGER, reading]]));
      store.set(selectedLoggerIdAtom, IDS.LOGGER);
    });

    await waitFor(() =>
      expect(overlayData(map, LOGGER_PRESSURE_LAYER_ID)).toEqual([
        {
          id: IDS.LOGGER,
          coordinates: logger.coordinates,
          text: "-0.250298 psi",
        },
      ]),
    );
    await fireMapClick(map, { lng: 40, lat: 40 });

    expect(store.get(selectedLoggerIdAtom)).toBeNull();
    expect(store.get(loggerReadingsAtom).get(IDS.LOGGER)).toBe(reading);
    expect(overlayData(map, LOGGER_PRESSURE_LAYER_ID)).toEqual([
      expect.objectContaining({ text: "-0.250298 psi" }),
    ]);

    act(() => {
      store.set(
        loggerReadingsAtom,
        new Map([[IDS.LOGGER, { ...reading, pressure: 0 }]]),
      );
    });

    await waitFor(() =>
      expect(overlayData(map, LOGGER_PRESSURE_LAYER_ID)).toEqual([
        expect.objectContaining({ text: "0 psi" }),
      ]),
    );
  });

  it("waits for pressure and formats received values in the map locale", async () => {
    const { store, map } = await mountLogger();
    const reading: LoggerReading = {
      deviceId: "L1",
      type: "device_status",
      timestamp: "2026-11-10T10:28:22",
      status: "online",
    };

    act(() => {
      store.set(localeAtom, "es");
      store.set(loggerReadingsAtom, new Map([[IDS.LOGGER, reading]]));
    });

    await waitFor(() =>
      expect(markerData(map)).toContainEqual(
        expect.objectContaining({ id: IDS.LOGGER }),
      ),
    );
    expect(overlayData(map, LOGGER_PRESSURE_LAYER_ID)).toEqual([]);

    act(() => {
      store.set(
        loggerReadingsAtom,
        new Map([[IDS.LOGGER, { ...reading, pressure: -0.250298 }]]),
      );
    });

    await waitFor(() =>
      expect(overlayData(map, LOGGER_PRESSURE_LAYER_ID)).toEqual([
        expect.objectContaining({ text: "-0,250298 psi" }),
      ]),
    );
  });

  it("draws and selects a logger without adding hydraulic assets or customers", async () => {
    const store = setInitialState({ mode: Mode.DRAW_LOGGER });
    const map = await renderMap(store);

    await fireMapMove(map, { lng: 3, lat: 4 });
    expect(store.get(loggerPreviewAtom)).toEqual({
      type: "draw",
      coordinates: [3, 4],
    });
    await fireMapClick(map, { lng: 3, lat: 4 });

    const [created] = store.get(loggersAtom);
    expect(created.coordinates).toEqual([3, 4]);
    expect(store.get(selectedLoggerIdAtom)).toBe(created.id);
    expect(store.get(stagingModelDerivedAtom).assets.size).toBe(0);
    expect(store.get(stagingModelDerivedAtom).customerPoints.size).toBe(0);
    await waitFor(() =>
      expect(markerData(map)).toContainEqual(
        expect.objectContaining({ id: created.id, coordinates: [3, 4] }),
      ),
    );
  });

  it("reselects a logger and moves it after a significant drag", async () => {
    const { store, map } = await mountLogger();
    map.pickOverlayObjects.mockReturnValue([
      { layer: { id: LOGGER_LAYER_ID }, object: logger },
    ]);

    await fireMapClick(map, { lng: 1, lat: 1 });
    expect(store.get(selectedLoggerIdAtom)).toBe(IDS.LOGGER);
    await fireMapDown(map, { lng: 1, lat: 1 });
    await fireMapMove(map, { lng: 2, lat: 3 });
    expect(store.get(loggersAtom)[0].coordinates).toEqual([1, 1]);
    expect(store.get(loggerPreviewAtom)).toEqual({
      type: "move",
      loggerId: IDS.LOGGER,
      coordinates: [2, 3],
    });
    await fireMapUp(map, { lng: 2, lat: 3 });
    expect(store.get(loggersAtom)[0].coordinates).toEqual([2, 3]);
    expect(store.get(loggerPreviewAtom)).toBeNull();
  });

  it("connects at the clicked location along a pipe without splitting it", async () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(IDS.JUNCTION, { coordinates: [0, 0] })
      .aTank(IDS.TANK, { coordinates: [10, 0] })
      .aPipe(IDS.PIPE, { startNodeId: IDS.JUNCTION, endNodeId: IDS.TANK })
      .build();
    const { store, map } = await mountLogger(hydraulicModel);
    enableConnection(store);
    map.map.queryRenderedFeatures.mockImplementation(
      (_point: unknown, options?: { layers?: string[] }) =>
        options?.layers?.includes("main-features-pipes")
          ? [{ id: IDS.PIPE, source: "main-features" }]
          : [],
    );

    await fireMapMove(map, { lng: 5, lat: 0 });
    expect(store.get(loggerPreviewAtom)).toEqual({
      type: "connect",
      loggerId: IDS.LOGGER,
      connection: { assetId: IDS.PIPE, snapPoint: [5, 0] },
    });
    await fireMapClick(map, { lng: 5, lat: 0 });

    expect(store.get(loggersAtom)[0].connection).toEqual({
      assetId: IDS.PIPE,
      snapPoint: [5, 0],
    });
    expect(store.get(stagingModelDerivedAtom).assets.size).toBe(3);
    expect(store.get(modeAtom).mode).toBe(Mode.NONE);
    expect(store.get(loggerPreviewAtom)).toBeNull();
  });

  it.each(["junction", "tank", "reservoir"] as const)(
    "connects directly to a %s",
    async (nodeType) => {
      const builder = HydraulicModelBuilder.with();
      if (nodeType === "junction")
        builder.aJunction(IDS.JUNCTION, { coordinates: [2, 3] });
      if (nodeType === "tank")
        builder.aTank(IDS.JUNCTION, { coordinates: [2, 3] });
      if (nodeType === "reservoir")
        builder.aReservoir(IDS.JUNCTION, { coordinates: [2, 3] });
      const { store, map } = await mountLogger(builder.build());
      enableConnection(store);
      map.map.queryRenderedFeatures.mockReturnValue([
        { id: IDS.JUNCTION, source: "main-features" },
      ]);

      await fireMapClick(map, { lng: 2, lat: 3 });

      expect(store.get(loggersAtom)[0].connection).toEqual({
        assetId: IDS.JUNCTION,
        snapPoint: [2, 3],
      });
    },
  );

  it("keeps the rendered connection along a pipe after its geometry changes", async () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(IDS.JUNCTION, { coordinates: [0, 0] })
      .aTank(IDS.TANK, { coordinates: [10, 0] })
      .aPipe(IDS.PIPE, { startNodeId: IDS.JUNCTION, endNodeId: IDS.TANK })
      .build();
    const { store, map } = await mountLogger(hydraulicModel);
    enableConnection(store);
    map.map.queryRenderedFeatures.mockImplementation(
      (_point: unknown, options?: { layers?: string[] }) =>
        options?.layers?.includes("main-features-pipes")
          ? [{ id: IDS.PIPE, source: "main-features" }]
          : [],
    );
    await fireMapClick(map, { lng: 5, lat: 0 });
    await waitFor(() =>
      expect(overlayData(map, "logger-connections-layer")).toContainEqual(
        expect.objectContaining({ target: [5, 0] }),
      ),
    );
    const { result } = renderHook(() => useModelTransaction(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });
    const { assetFactory, labelManager } = store.get(modelFactoriesAtom);

    act(() => {
      result.current.transact(() =>
        moveNode(store.get(stagingModelDerivedAtom), {
          nodeId: IDS.TANK,
          newCoordinates: [0, 10],
          newElevation: null,
          lengthUnit: "m",
          assetFactory,
          labelManager,
        }),
      );
    });

    await waitFor(() =>
      expect(overlayData(map, "logger-connections-layer")).toContainEqual(
        expect.objectContaining({ target: [0, 0] }),
      ),
    );
  });

  it("ignores empty connection targets and cancels with Escape", async () => {
    const { store, map } = await mountLogger();
    enableConnection(store);
    await fireMapClick(map, { lng: 40, lat: 40 });
    expect(store.get(loggersAtom)[0].connection).toBeNull();
    expect(store.get(modeAtom).mode).toBe(Mode.CONNECT_LOGGER);

    act(() => triggerShortcut("esc"));

    expect(store.get(modeAtom).mode).toBe(Mode.NONE);
    expect(store.get(loggerPreviewAtom)).toBeNull();
  });

  it("cancels a drag without changing the saved location", async () => {
    const { store, map } = await mountLogger();
    act(() => store.set(selectedLoggerIdAtom, IDS.LOGGER));
    map.pickOverlayObjects.mockReturnValue([
      { layer: { id: LOGGER_LAYER_ID }, object: logger },
    ]);
    await fireMapDown(map, { lng: 1, lat: 1 });
    await fireMapMove(map, { lng: 2, lat: 3 });

    act(() => triggerShortcut("esc"));
    await fireMapUp(map, { lng: 2, lat: 3 });

    expect(store.get(loggersAtom)[0].coordinates).toEqual([1, 1]);
    expect(store.get(loggerPreviewAtom)).toBeNull();
    expect(store.get(selectedLoggerIdAtom)).toBe(IDS.LOGGER);
  });

  it("does not connect or move loggers when editing is blocked", async () => {
    isEditionBlocked = true;
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(IDS.JUNCTION, { coordinates: [2, 3] })
      .build();
    const { store, map } = await mountLogger(hydraulicModel);
    enableConnection(store);
    map.map.queryRenderedFeatures.mockReturnValue([
      { id: IDS.JUNCTION, source: "main-features" },
    ]);
    await fireMapClick(map, { lng: 2, lat: 3 });
    expect(store.get(loggersAtom)[0].connection).toBeNull();

    act(() => store.set(modeAtom, { mode: Mode.NONE }));
    map.map.queryRenderedFeatures.mockReturnValue([]);
    map.pickOverlayObjects.mockReturnValue([
      { layer: { id: LOGGER_LAYER_ID }, object: logger },
    ]);
    await fireMapDown(map, { lng: 1, lat: 1 });
    await fireMapMove(map, { lng: 2, lat: 3 });
    await fireMapUp(map, { lng: 2, lat: 3 });
    expect(store.get(loggersAtom)[0].coordinates).toEqual([1, 1]);
  });

  it("does not place loggers when editing is blocked", async () => {
    isEditionBlocked = true;
    const store = setInitialState({ mode: Mode.DRAW_LOGGER });
    const map = await renderMap(store);

    await fireMapClick(map, { lng: 3, lat: 4 });

    expect(store.get(loggersAtom)).toHaveLength(0);
  });
});

const mountLogger = async (
  hydraulicModel = HydraulicModelBuilder.with().build(),
) => {
  const store = setInitialState({ hydraulicModel });
  store.set(projectSettingsAtom, {
    ...store.get(projectSettingsAtom),
    loggers: [logger],
  });
  const map = await renderMap(store);
  return { store, map };
};

const enableConnection = (store: ReturnType<typeof setInitialState>) => {
  act(() => {
    store.set(selectedLoggerIdAtom, IDS.LOGGER);
    store.set(modeAtom, { mode: Mode.CONNECT_LOGGER });
  });
};

const markerData = (map: MapTestEngine): unknown[] => {
  return overlayData(map, LOGGER_LAYER_ID);
};

const overlayData = (map: MapTestEngine, layerId: string): unknown[] => {
  const layers = map.setOverlay.mock.lastCall?.[0] as
    Array<{ id: string; props: { data: unknown[] } }> | undefined;
  return layers?.find((layer) => layer.id === layerId)?.props.data ?? [];
};
