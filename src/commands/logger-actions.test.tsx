import { act, renderHook } from "@testing-library/react";
import { Provider } from "jotai";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import {
  defaultProjectSettings,
  type ProjectSettings,
} from "@epanet-js/project-settings";
import { setInitialState } from "src/__helpers__/state";
import { stubUserTracking } from "src/__helpers__/user-tracking";
import { useInProcessDb } from "src/lib/db/__test-helpers__/in-process-db";
import { importProject } from "src/lib/db/commands/import-project";
import { fetchProject } from "src/lib/db/commands/fetch-project";
import { writeQueue } from "src/lib/persistence/write-queue";
import { defaultSimulationSettings } from "src/simulation/simulation-settings";
import { projectSettingsAtom } from "src/state/project-settings";
import { projectDataVersionAtom } from "src/state/project-revision";
import { loggersAtom, selectedLoggerIdAtom } from "src/state/loggers";
import { dialogAtom } from "src/state/dialog";
import { loggerPreviewAtom } from "src/state/logger-map";
import { cursorStyleAtom } from "src/state/map";
import { modeAtom, Mode } from "src/state/mode";
import { isNarrowViewportAtom, splitsAtom } from "src/state/layout";
import { activePanelIn, panelsAtom, panelsIn } from "src/state/panels";
import { selectionAtom } from "src/state/selection";
import { USelection } from "src/selection";
import { createAssetPanel } from "src/panels/asset-panel/create-panel";
import { createMapStylingPanel } from "src/panels/map-styling-editor/create-panel";
import type { Store } from "src/state";
import { useLoggerActions } from "./logger-actions";
import { useDismissAssetPanel } from "./dismiss-asset-panel";
import { getLoggerStreamManager } from "./logger-stream";
import { loggerStreamsAtom } from "src/state/logger-stream";
import type { LoggerSocket } from "src/lib/logger-stream";

const streamStores = new Set<Store>();
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
}

const renderActions = (store: Store) => {
  streamStores.add(store);
  return renderHook(() => useLoggerActions(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
};

describe("logger actions", () => {
  useInProcessDb();
  beforeEach(() => {
    stubUserTracking();
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
    vi.unstubAllGlobals();
  });

  it("creates a logger with its nearest junction and starts live data", async () => {
    const IDS = { NEAR: 1, FAR: 2, TANK: 3 } as const;
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(IDS.FAR, { coordinates: [10, 0] })
      .aJunction(IDS.NEAR, { coordinates: [1, 0] })
      .aTank(IDS.TANK, { coordinates: [2, 1] })
      .build();
    await importProject({
      newDb: true,
      hydraulicModel,
      projectSettings: defaultProjectSettings,
      simulationSettings: defaultSimulationSettings,
    });
    const store = setInitialState({ hydraulicModel, mode: Mode.DRAW_LOGGER });
    store.set(loggerPreviewAtom, { type: "draw", coordinates: [2, 1] });
    store.set(cursorStyleAtom, "crosshair");
    const snapshots: ProjectSettings[] = [];
    const unsubscribe = store.sub(projectSettingsAtom, () =>
      snapshots.push(store.get(projectSettingsAtom)),
    );
    const { result } = renderActions(store);

    await act(async () => {
      await result.current.addLogger([2, 1]);
      await writeQueue.whenIdle();
    });
    unsubscribe();

    const [created] = store.get(loggersAtom);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].loggers?.[0].connection).toEqual({
      assetId: IDS.NEAR,
      snapPoint: [1, 0],
    });
    expect((await fetchProject()).projectSettings.loggers).toEqual([created]);
    expect(store.get(selectedLoggerIdAtom)).toBe(created.id);
    expect(store.get(modeAtom).mode).toBe(Mode.NONE);
    expect(store.get(loggerPreviewAtom)).toBeNull();
    expect(store.get(cursorStyleAtom)).toBe("default");
    expect(store.get(loggerStreamsAtom).get(created.id)).toMatchObject({
      deviceId: "L1",
      isRunning: true,
      status: "connecting",
    });
    expect(loadStreamConfig).toHaveBeenCalledOnce();
    expect(FakeSocket.sockets.map((socket) => socket.url)).toEqual([
      "wss://example.com/stream?deviceId=L1",
    ]);
  });

  it.each([false, true])(
    "selects a logger into the floating inspector and collapses docked inspectors (narrow: %s)",
    (isNarrowViewport) => {
      const IDS = { J1: 1, L1: "1" } as const;
      const hydraulicModel = HydraulicModelBuilder.with()
        .aJunction(IDS.J1)
        .build();
      const store = setInitialState({ hydraulicModel });
      store.set(panelsAtom, [createAssetPanel(), createMapStylingPanel()]);
      store.set(isNarrowViewportAtom, isNarrowViewport);
      store.set(selectionAtom, USelection.singleAsset(IDS.J1));
      store.set(projectSettingsAtom, {
        ...store.get(projectSettingsAtom),
        loggers: [
          {
            id: IDS.L1,
            label: "Logger 1",
            coordinates: [1, 1],
            connection: null,
          },
        ],
      });
      store.set(splitsAtom, {
        ...store.get(splitsAtom),
        rightOpen: true,
        verticalOpen: true,
      });
      const { result } = renderActions(store);

      act(() => result.current.selectLogger(IDS.L1));

      expect(USelection.isNone(store.get(selectionAtom))).toBe(true);
      expect(store.get(selectedLoggerIdAtom)).toEqual(IDS.L1);
      expect(store.get(activePanelIn("floating"))?.id).toEqual("asset");
      expect(store.get(splitsAtom).rightOpen).toBe(false);
      expect(store.get(splitsAtom).verticalOpen).toBe(false);
    },
  );

  it("dismisses a logger and clears its pending connection without changing the project", () => {
    const IDS = { J1: 1, L1: "1" } as const;
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(IDS.J1)
      .build();
    const store = setInitialState({ hydraulicModel });
    store.set(panelsAtom, [createAssetPanel()]);
    store.set(projectSettingsAtom, {
      ...store.get(projectSettingsAtom),
      loggers: [
        {
          id: IDS.L1,
          label: "Logger 1",
          coordinates: [1, 1],
          connection: null,
        },
      ],
    });
    store.set(selectionAtom, USelection.singleAsset(IDS.J1));
    store.set(selectedLoggerIdAtom, IDS.L1);
    store.set(loggerPreviewAtom, {
      type: "connect",
      loggerId: IDS.L1,
      connection: { assetId: IDS.J1, snapPoint: [0, 0] },
    });
    store.set(modeAtom, { mode: Mode.CONNECT_LOGGER });
    store.set(cursorStyleAtom, "crosshair");
    const settingsBefore = store.get(projectSettingsAtom);
    const { result } = renderHook(() => useDismissAssetPanel(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });

    act(() => result.current());

    expect(USelection.isNone(store.get(selectionAtom))).toBe(true);
    expect(store.get(selectedLoggerIdAtom)).toBeNull();
    expect(store.get(loggerPreviewAtom)).toBeNull();
    expect(store.get(modeAtom).mode).toEqual(Mode.NONE);
    expect(store.get(cursorStyleAtom)).toEqual("default");
    expect(store.get(panelsIn("floating"))).toEqual([]);
    expect(store.get(projectSettingsAtom)).toBe(settingsBefore);
  });

  it("preserves consecutive creations and persists connection edits", async () => {
    const IDS = { J1: 1, J2: 2, P1: 3 } as const;
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(IDS.J1, { coordinates: [0, 0] })
      .aJunction(IDS.J2, { coordinates: [10, 0] })
      .aPipe(IDS.P1, { startNodeId: IDS.J1, endNodeId: IDS.J2 })
      .build();
    await importProject({
      newDb: true,
      hydraulicModel,
      projectSettings: defaultProjectSettings,
      simulationSettings: defaultSimulationSettings,
    });
    const store = setInitialState({ hydraulicModel });
    const versionBefore = store.get(projectDataVersionAtom);
    const { result } = renderActions(store);

    await act(async () => {
      await result.current.addLogger([2, 1]);
      await result.current.addLogger([8, 1]);
      const [first, second] = store.get(loggersAtom);
      expect(first.connection).toEqual({ assetId: IDS.J1, snapPoint: [0, 0] });
      expect(second.connection).toEqual({
        assetId: IDS.J2,
        snapPoint: [10, 0],
      });
      await result.current.connectLogger(first.id, {
        assetId: IDS.P1,
        snapPoint: [2, 0],
      });
      await result.current.connectLogger(second.id, {
        assetId: IDS.J2,
        snapPoint: [100, 100],
      });
      await writeQueue.whenIdle();
    });

    const loggers = store.get(loggersAtom);
    expect(loggers).toHaveLength(2);
    expect(loggers[0].label).not.toBe(loggers[1].label);
    expect(loggers[0].connection).toEqual({
      assetId: IDS.P1,
      snapPoint: [2, 0],
    });
    expect(loggers[1].connection).toEqual({
      assetId: IDS.J2,
      snapPoint: [10, 0],
    });
    expect(store.get(projectDataVersionAtom)).not.toBe(versionBefore);
    expect((await fetchProject()).projectSettings.loggers).toEqual(loggers);
  });

  it("rejects coordinates it cannot persist before updating the project", async () => {
    const hydraulicModel = HydraulicModelBuilder.with().build();
    await importProject({
      newDb: true,
      hydraulicModel,
      projectSettings: defaultProjectSettings,
      simulationSettings: defaultSimulationSettings,
    });
    const store = setInitialState({ hydraulicModel, mode: Mode.DRAW_LOGGER });
    const preview = {
      type: "draw" as const,
      coordinates: [1, 1] as [number, number],
    };
    store.set(loggerPreviewAtom, preview);
    const settingsBefore = store.get(projectSettingsAtom);
    const versionBefore = store.get(projectDataVersionAtom);
    const { result } = renderActions(store);
    let id: string | null = null;

    await act(async () => {
      id = await result.current.addLogger([NaN, 1]);
      await writeQueue.whenIdle();
    });

    expect(id).toBeNull();
    expect(store.get(projectSettingsAtom)).toBe(settingsBefore);
    expect(store.get(projectDataVersionAtom)).toBe(versionBefore);
    expect(store.get(dialogAtom)).toEqual({ type: "changeNotApplied" });
    expect(store.get(modeAtom).mode).toBe(Mode.DRAW_LOGGER);
    expect(store.get(loggerPreviewAtom)).toEqual(preview);
    expect(store.get(loggerStreamsAtom).size).toBe(0);
    expect(loadStreamConfig).not.toHaveBeenCalled();
    expect(FakeSocket.sockets).toHaveLength(0);
    expect((await fetchProject()).projectSettings.loggers).toBeUndefined();
  });

  it("clears connection and movement previews after disconnection or deletion", async () => {
    const IDS = { J1: 1, L1: "1" } as const;
    const hydraulicModel = HydraulicModelBuilder.with()
      .aJunction(IDS.J1)
      .build();
    const projectSettings: ProjectSettings = {
      ...defaultProjectSettings,
      loggers: [
        {
          id: IDS.L1,
          label: "Logger 1",
          coordinates: [1, 1],
          connection: { assetId: IDS.J1, snapPoint: [0, 0] },
        },
      ],
    };
    await importProject({
      newDb: true,
      hydraulicModel,
      projectSettings,
      simulationSettings: defaultSimulationSettings,
    });
    const store = setInitialState({ hydraulicModel });
    store.set(projectSettingsAtom, projectSettings);
    const { result } = renderActions(store);

    await act(async () => {
      result.current.startConnection(IDS.L1);
      store.set(loggerPreviewAtom, {
        type: "connect",
        loggerId: IDS.L1,
        connection: { assetId: IDS.J1, snapPoint: [0, 0] },
      });
      await result.current.disconnectLogger(IDS.L1);
      await writeQueue.whenIdle();
    });

    expect(store.get(loggersAtom)[0].connection).toBeNull();
    expect(store.get(loggerPreviewAtom)).toBeNull();
    expect(store.get(modeAtom).mode).toBe(Mode.NONE);
    expect(store.get(cursorStyleAtom)).toBe("default");

    await act(async () => {
      store.set(loggerPreviewAtom, {
        type: "move",
        loggerId: IDS.L1,
        coordinates: [2, 2],
      });
      store.set(cursorStyleAtom, "move");
      await result.current.deleteLogger(IDS.L1);
      await writeQueue.whenIdle();
    });

    expect(store.get(loggersAtom)).toEqual([]);
    expect(store.get(loggerPreviewAtom)).toBeNull();
    expect(store.get(cursorStyleAtom)).toBe("default");
    expect((await fetchProject()).projectSettings.loggers).toEqual([]);
  });
});
