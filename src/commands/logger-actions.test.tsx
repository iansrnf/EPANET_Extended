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
import { loggersAtom } from "src/state/loggers";
import { dialogAtom } from "src/state/dialog";
import { loggerPreviewAtom } from "src/state/logger-map";
import { cursorStyleAtom } from "src/state/map";
import { modeAtom, Mode } from "src/state/mode";
import type { Store } from "src/state";
import { useLoggerActions } from "./logger-actions";

const renderActions = (store: Store) =>
  renderHook(() => useLoggerActions(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });

describe("logger actions", () => {
  useInProcessDb();
  beforeEach(() => stubUserTracking());

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
    const store = setInitialState({ hydraulicModel });
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
