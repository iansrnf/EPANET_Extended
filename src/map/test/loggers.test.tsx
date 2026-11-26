import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { Provider } from "jotai";
import mapboxgl from "mapbox-gl";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { moveNode } from "@epanet-js/hydraulic-model-operations";
import type { Logger } from "@epanet-js/project-settings";
import { triggerShortcut } from "src/__helpers__/keyboard";
import { setInitialState } from "src/__helpers__/state";
import { projectSettingsAtom } from "src/state/project-settings";
import {
  hoveredLoggerIdAtom,
  loggersAtom,
  selectedLoggerIdAtom,
} from "src/state/loggers";
import { hoveredAssetIdAtom } from "src/state/asset-hover";
import { selectionAtom } from "src/state/selection";
import { loggerPreviewAtom } from "src/state/logger-map";
import { Mode, modeAtom } from "src/state/mode";
import { stagingModelDerivedAtom } from "src/state/derived-branch-state";
import { modelFactoriesAtom } from "src/state/model-factories";
import { useModelTransaction } from "src/hooks/persistence/use-model-transaction";
import {
  LOGGER_LAYER_ID,
  LOGGER_PRESSURE_LAYER_ID,
} from "src/map/overlays/loggers";
import { loggerReadingsAtom, loggerStreamsAtom } from "src/state/logger-stream";
import { getLoggerStreamManager } from "src/commands/logger-stream";
import { cursorStyleAtom } from "src/state/map";
import { localeAtom } from "src/state/locale";
import type { LoggerReading, LoggerSocket } from "src/lib/logger-stream";
import { renderMap } from "./__helpers__/map";
import {
  fireMapClick,
  fireMapDown,
  fireMapMove,
  fireMapUp,
  getSourceFeatures,
  stubSnapping,
} from "./__helpers__/map-engine-mock";
import type { MapTestEngine } from "./__helpers__/map-engine-mock";

let isEditionBlocked = false;
vi.mock("src/hooks/use-is-edition-blocked", () => ({
  useIsEditionBlocked: () => isEditionBlocked,
}));

const IDS = {
  LOGGER: "logger-1",
  OTHER_LOGGER: "logger-2",
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

const streamStores = new Set<ReturnType<typeof setInitialState>>();
const loadStreamConfig = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ url: "wss://example.com/stream" }),
  }),
);

class FakeSocket implements LoggerSocket {
  static sockets: FakeSocket[] = [];
  onopen: LoggerSocket["onopen"] = null;
  onmessage: LoggerSocket["onmessage"] = null;
  onerror: LoggerSocket["onerror"] = null;
  onclose: LoggerSocket["onclose"] = null;
  close = vi.fn();

  constructor(public readonly url: string) {
    FakeSocket.sockets.push(this);
  }

  receivePressure(pressure: number, timestamp: string) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          deviceId: "L1",
          type: "pressure",
          timestamp,
          pressure,
        }),
      }),
    );
  }
}

beforeEach(() => {
  FakeSocket.sockets = [];
  loadStreamConfig.mockClear();
  vi.stubGlobal("fetch", loadStreamConfig);
  vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(() => {
  act(() => {
    for (const store of streamStores) getLoggerStreamManager(store).clear();
  });
  streamStores.clear();
  cleanup();
  sessionStorage.removeItem("locale");
  isEditionBlocked = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("loggers on the map", () => {
  it("scales a selected logger with zoom and keeps the scale through reading and selection updates", async () => {
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(IDS.JUNCTION, { coordinates: [2, 3] })
      .build();
    const { store, map } = await mountLogger(hydraulicModel);
    const reading: LoggerReading = {
      deviceId: "L1",
      type: "pressure",
      timestamp: "2026-11-10T10:28:22",
      pressure: 12,
      status: "online",
    };
    act(() => {
      store.set(projectSettingsAtom, {
        ...store.get(projectSettingsAtom),
        loggers: [
          {
            ...logger,
            connection: { assetId: IDS.JUNCTION, snapPoint: [2, 3] },
          },
        ],
      });
      store.set(loggerReadingsAtom, new Map([[IDS.LOGGER, reading]]));
    });
    map.pickOverlayObjects.mockReturnValue([
      { layer: { id: LOGGER_LAYER_ID }, object: logger },
    ]);
    await fireMapClick(map, { lng: 1, lat: 1 });
    await zoomMap(map, 20);
    await waitFor(() => {
      expect(overlayProps(map, LOGGER_LAYER_ID).sizeScale).toBe(1);
      expect(feedbackData(map)).toHaveLength(1);
      expect(overlayData(map, "logger-connections-layer")).toHaveLength(1);
    });
    const normalScale = Number(overlayProps(map, LOGGER_LAYER_ID).sizeScale);
    const normalOffset = overlayProps(map, LOGGER_PRESSURE_LAYER_ID)
      .getPixelOffset as number[];
    const markers = markerData(map);
    const connections = overlayData(map, "logger-connections-layer");
    const feedback = feedbackData(map);

    await zoomMap(map, 10);

    await waitFor(() =>
      expect(overlayProps(map, LOGGER_LAYER_ID).sizeScale).toBeLessThan(
        normalScale,
      ),
    );
    const wideScale = Number(overlayProps(map, LOGGER_LAYER_ID).sizeScale);
    const wideOffset = overlayProps(map, LOGGER_PRESSURE_LAYER_ID)
      .getPixelOffset as number[];
    expect(overlayProps(map, "logger-feedback-ring")).toMatchObject({
      radiusScale: wideScale,
      lineWidthScale: wideScale,
    });
    expect(markerData(map)).toBe(markers);
    expect(overlayData(map, "logger-connections-layer")).toBe(connections);
    expect(feedbackData(map)).toBe(feedback);
    expect(wideOffset[1]).toBeGreaterThan(normalOffset[1]);
    expect(overlayProps(map, LOGGER_PRESSURE_LAYER_ID).getSize).toBe(13);
    expect(store.get(selectedLoggerIdAtom)).toBe(IDS.LOGGER);

    await zoomMap(map, 5);
    await waitFor(() =>
      expect(overlayProps(map, LOGGER_LAYER_ID).sizeScale).toBe(wideScale),
    );
    await zoomMap(map, 25);
    await waitFor(() => {
      expect(overlayProps(map, LOGGER_LAYER_ID).sizeScale).toBe(normalScale);
      expect(overlayProps(map, "logger-feedback-ring")).toMatchObject({
        radiusScale: normalScale,
        lineWidthScale: normalScale,
      });
    });
    await zoomMap(map, 10);
    act(() => {
      store.set(
        loggerReadingsAtom,
        new Map([[IDS.LOGGER, { ...reading, pressure: 20 }]]),
      );
    });
    await waitFor(() => {
      expect(overlayData(map, LOGGER_PRESSURE_LAYER_ID)).toEqual([
        expect.objectContaining({ text: "20 psi" }),
      ]);
      expect(overlayProps(map, LOGGER_LAYER_ID).sizeScale).toBe(wideScale);
      expect(overlayProps(map, LOGGER_PRESSURE_LAYER_ID).getSize).toBe(13);
      expect(
        overlayProps(map, LOGGER_PRESSURE_LAYER_ID).getPixelOffset,
      ).toEqual(wideOffset);
    });
    map.pickOverlayObjects.mockReturnValue([]);
    await fireMapClick(map, { lng: 40, lat: 40 });
    await waitFor(() => expect(feedbackData(map)).toEqual([]));
    map.pickOverlayObjects.mockReturnValue([
      { layer: { id: LOGGER_LAYER_ID }, object: logger },
    ]);
    await fireMapClick(map, { lng: 1, lat: 1 });
    await waitFor(() => {
      expect(feedbackData(map)).toHaveLength(1);
      expect(overlayProps(map, LOGGER_LAYER_ID).sizeScale).toBe(wideScale);
      expect(overlayProps(map, "logger-feedback-ring")).toMatchObject({
        radiusScale: wideScale,
        lineWidthScale: wideScale,
      });
    });
    expect(store.get(selectedLoggerIdAtom)).toBe(IDS.LOGGER);
  });

  it.each([false, true])(
    "hovers a logger above a node without changing the model when readonly is %s",
    async (readonly) => {
      isEditionBlocked = readonly;
      const hydraulicModel = HydraulicModelBuilder.with()
        .aJunction(IDS.JUNCTION, { coordinates: logger.coordinates })
        .build();
      const { store, map } = await mountLogger(hydraulicModel);
      await waitFor(() =>
        expect(getSourceFeatures(map, "main-features")).toHaveLength(1),
      );
      const snapshot = getSourceFeatures(map, "main-features");
      const editions = getSourceFeatures(map, "delta-features");
      const model = store.get(stagingModelDerivedAtom);
      const settings = store.get(projectSettingsAtom);
      const selection = store.get(selectionAtom);
      stubSnapping(map, [IDS.JUNCTION]);
      await movePointer(map, { lng: 1, lat: 1 });
      await waitFor(() =>
        expect(store.get(hoveredAssetIdAtom)).toBe(IDS.JUNCTION),
      );
      map.pickOverlayObjects.mockReturnValue([
        { layer: { id: LOGGER_LAYER_ID }, object: logger },
      ]);

      await movePointer(map, { lng: 1, lat: 1 });

      await waitFor(() => {
        expect(store.get(hoveredLoggerIdAtom)).toBe(IDS.LOGGER);
        expect(store.get(hoveredAssetIdAtom)).toBeNull();
        expect(getSourceFeatures(map, "asset-hover")).toEqual([]);
        expect(feedbackData(map)).toEqual([
          expect.objectContaining({
            id: IDS.LOGGER,
            coordinates: logger.coordinates,
          }),
        ]);
      });
      expect(store.get(selectedLoggerIdAtom)).toBeNull();
      expect(store.get(selectionAtom)).toBe(selection);
      expect(store.get(stagingModelDerivedAtom)).toBe(model);
      expect(store.get(projectSettingsAtom)).toBe(settings);
      expect(getSourceFeatures(map, "main-features")).toBe(snapshot);
      expect(getSourceFeatures(map, "delta-features")).toBe(editions);
    },
  );

  it("keeps selected feedback while hovering another logger without duplicating either ring", async () => {
    const { store, map } = await mountLogger();
    const otherLogger: Logger = {
      ...logger,
      id: IDS.OTHER_LOGGER,
      coordinates: [4, 1],
    };
    act(() => {
      store.set(projectSettingsAtom, {
        ...store.get(projectSettingsAtom),
        loggers: [logger, otherLogger],
      });
    });
    map.pickOverlayObjects.mockReturnValue([
      { layer: { id: LOGGER_LAYER_ID }, object: logger },
    ]);
    await fireMapClick(map, { lng: 1, lat: 1 });
    await movePointer(map, { lng: 1, lat: 1 });
    await waitFor(() => {
      expect(store.get(hoveredLoggerIdAtom)).toBe(IDS.LOGGER);
      expect(feedbackData(map)).toHaveLength(1);
    });
    map.pickOverlayObjects.mockReturnValue([
      { layer: { id: LOGGER_LAYER_ID }, object: otherLogger },
    ]);

    await movePointer(map, { lng: 4, lat: 1 });

    await waitFor(() => {
      expect(store.get(hoveredLoggerIdAtom)).toBe(IDS.OTHER_LOGGER);
      expect(feedbackData(map)).toHaveLength(2);
      expect(feedbackData(map)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: IDS.LOGGER }),
          expect.objectContaining({ id: IDS.OTHER_LOGGER }),
        ]),
      );
    });
    expect(store.get(selectedLoggerIdAtom)).toBe(IDS.LOGGER);
    map.pickOverlayObjects.mockReturnValue([]);

    await movePointer(map, { lng: 10, lat: 10 });

    await waitFor(() =>
      expect(feedbackData(map)).toEqual([
        expect.objectContaining({ id: IDS.LOGGER }),
      ]),
    );
  });

  it.each(["blank map", "map boundary", "mode change", "pointer down"])(
    "clears hover at %s while retaining the selected logger",
    async (action) => {
      const { store, map } = await mountLogger();
      map.pickOverlayObjects.mockReturnValue([
        { layer: { id: LOGGER_LAYER_ID }, object: logger },
      ]);
      await fireMapClick(map, { lng: 1, lat: 1 });
      await movePointer(map, { lng: 1, lat: 1 });
      await waitFor(() =>
        expect(store.get(hoveredLoggerIdAtom)).toBe(IDS.LOGGER),
      );

      if (action === "blank map") {
        map.pickOverlayObjects.mockReturnValue([]);
        await movePointer(map, { lng: 10, lat: 10 });
      } else if (action === "map boundary") {
        fireEvent.mouseLeave(screen.getByTestId("map"));
      } else if (action === "mode change") {
        act(() => store.set(modeAtom, { mode: Mode.DRAW_JUNCTION }));
      } else {
        await fireMapDown(map, { lng: 1, lat: 1 });
      }

      await waitFor(() => {
        expect(store.get(hoveredLoggerIdAtom)).toBeNull();
        expect(feedbackData(map)).toEqual([
          expect.objectContaining({ id: IDS.LOGGER }),
        ]);
      });
      expect(store.get(selectedLoggerIdAtom)).toBe(IDS.LOGGER);
    },
  );

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
    streamStores.add(store);
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
    expect(created.connection).toBeNull();
    expect(store.get(modeAtom).mode).toBe(Mode.NONE);
    expect(store.get(loggerStreamsAtom).get(created.id)?.isRunning).toBe(true);
    expect(store.get(stagingModelDerivedAtom).assets.size).toBe(0);
    expect(store.get(stagingModelDerivedAtom).customerPoints.size).toBe(0);
    await waitFor(() =>
      expect(markerData(map)).toContainEqual(
        expect.objectContaining({ id: created.id, coordinates: [3, 4] }),
      ),
    );
  });

  it("places once, connects the nearest junction and keeps live readings in Select mode", async () => {
    const IDS = { NEAR: 1, FAR: 2, TANK: 3 } as const;
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(IDS.FAR, { coordinates: [10, 0] })
      .aJunction(IDS.NEAR, { coordinates: [2, 3] })
      .aTank(IDS.TANK, { coordinates: [3, 4] })
      .build();
    const store = setInitialState({ hydraulicModel, mode: Mode.DRAW_LOGGER });
    streamStores.add(store);
    const map = await renderMap(store);
    await fireMapMove(map, { lng: 3, lat: 4 });
    const placementHandler = map.handlers.current.onClick;
    const event = {
      lngLat: new mapboxgl.LngLat(3, 4),
      point: new mapboxgl.Point(300, 400),
      originalEvent: new MouseEvent("click"),
      target: map.map,
      type: "click",
      defaultPrevented: false,
    } as unknown as Parameters<typeof placementHandler>[0];

    await act(async () => {
      placementHandler(event);
      placementHandler(event);
      await Promise.resolve();
    });
    await waitFor(() => expect(FakeSocket.sockets).toHaveLength(1));
    const [created] = store.get(loggersAtom);
    expect(store.get(loggersAtom)).toHaveLength(1);
    expect(created.connection).toEqual({
      assetId: IDS.NEAR,
      snapPoint: [2, 3],
    });
    expect(store.get(selectedLoggerIdAtom)).toBe(created.id);
    expect(store.get(modeAtom).mode).toBe(Mode.NONE);
    expect(store.get(loggerPreviewAtom)).toBeNull();
    expect(store.get(cursorStyleAtom)).toBe("default");
    expect(store.get(stagingModelDerivedAtom)).toBe(hydraulicModel);
    await waitFor(() =>
      expect(overlayData(map, "logger-connections-layer")).toContainEqual(
        expect.objectContaining({ source: [3, 4], target: [2, 3] }),
      ),
    );
    expect(store.get(loggerStreamsAtom).get(created.id)).toMatchObject({
      deviceId: "L1",
      isRunning: true,
    });
    const socket = FakeSocket.sockets[0];
    expect(socket.url).toBe("wss://example.com/stream?deviceId=L1");
    act(() => {
      socket.onopen?.(new Event("open"));
      socket.receivePressure(12.5, "2026-11-26T13:23:34");
    });
    await waitFor(() =>
      expect(overlayData(map, LOGGER_PRESSURE_LAYER_ID)).toContainEqual(
        expect.objectContaining({ text: "12.5 psi" }),
      ),
    );

    act(() => placementHandler(event));
    await fireMapClick(map, { lng: 20, lat: 20 });
    act(() => socket.receivePressure(13, "2026-11-26T13:23:35"));

    await waitFor(() =>
      expect(overlayData(map, LOGGER_PRESSURE_LAYER_ID)).toContainEqual(
        expect.objectContaining({ text: "13 psi" }),
      ),
    );
    expect(store.get(modeAtom).mode).toBe(Mode.NONE);
    expect(store.get(loggersAtom)).toHaveLength(1);
    expect(loadStreamConfig).toHaveBeenCalledOnce();
    expect(FakeSocket.sockets).toHaveLength(1);
    expect(socket.close).not.toHaveBeenCalled();
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
    await waitFor(() =>
      expect(feedbackData(map)).toEqual([
        expect.objectContaining({ id: IDS.LOGGER, coordinates: [2, 3] }),
      ]),
    );
    await fireMapUp(map, { lng: 2, lat: 3 });
    expect(store.get(loggersAtom)[0].coordinates).toEqual([2, 3]);
    expect(store.get(loggerPreviewAtom)).toBeNull();
    await waitFor(() =>
      expect(feedbackData(map)).toEqual([
        expect.objectContaining({ id: IDS.LOGGER, coordinates: [2, 3] }),
      ]),
    );
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
    streamStores.add(store);
    const map = await renderMap(store);

    await fireMapClick(map, { lng: 3, lat: 4 });

    expect(store.get(loggersAtom)).toHaveLength(0);
    expect(store.get(modeAtom).mode).toBe(Mode.DRAW_LOGGER);
    expect(store.get(loggerStreamsAtom).size).toBe(0);
    expect(loadStreamConfig).not.toHaveBeenCalled();
    expect(FakeSocket.sockets).toHaveLength(0);
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

const feedbackData = (map: MapTestEngine): unknown[] =>
  overlayData(map, "logger-feedback-ring");

const zoomMap = async (map: MapTestEngine, zoom: number) => {
  await act(async () => {
    map.map.getZoom.mockReturnValue(zoom);
    map.handlers.current.onZoom({ target: map.map } as unknown as Parameters<
      typeof map.handlers.current.onZoom
    >[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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

const overlayData = (map: MapTestEngine, layerId: string): unknown[] => {
  const layers = map.setOverlay.mock.lastCall?.[0] as
    Array<{ id: string; props: { data: unknown[] } }> | undefined;
  return layers?.find((layer) => layer.id === layerId)?.props.data ?? [];
};

const overlayProps = (map: MapTestEngine, layerId: string) => {
  const layers = map.setOverlay.mock.lastCall?.[0] as
    Array<{ id: string; props: Record<string, unknown> }> | undefined;
  return layers?.find((layer) => layer.id === layerId)?.props ?? {};
};
