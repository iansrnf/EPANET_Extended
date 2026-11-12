import { useCallback } from "react";
import { useSetAtom, useStore } from "jotai";
import { nanoid } from "nanoid";
import type { Position } from "geojson";
import type {
  Logger,
  LoggerConnection,
  LoggerId,
} from "@epanet-js/project-settings";
import { useProjectSettingsTransaction } from "src/hooks/persistence/use-project-settings-transaction";
import { useIsEditionBlocked } from "src/hooks/use-is-edition-blocked";
import { useTranslate } from "src/hooks/use-translate";
import { useShowAssetPanel } from "src/commands/show-asset-panel";
import { USelection } from "src/selection";
import { selectionAtom } from "src/state/selection";
import { selectedLoggerIdAtom } from "src/state/loggers";
import { loggerPreviewAtom } from "src/state/logger-map";
import { modeAtom, Mode } from "src/state/mode";
import { cursorStyleAtom } from "src/state/map";
import { projectSettingsAtom } from "src/state/project-settings";
import { stagingModelDerivedAtom } from "src/state/derived-branch-state";
import {
  isLoggerLabelAvailable,
  loggerCoordinates,
  nextLoggerLabel,
  resolveLoggerConnection,
} from "src/lib/loggers";

export const useLoggerActions = () => {
  const store = useStore();
  const setMode = useSetAtom(modeAtom);
  const { transact } = useProjectSettingsTransaction();
  const isEditionBlocked = useIsEditionBlocked();
  const showAssetPanel = useShowAssetPanel();
  const translate = useTranslate();

  const clearLoggerInteraction = useCallback(
    (id: LoggerId) => {
      const preview = store.get(loggerPreviewAtom);
      const hasPreview =
        preview && preview.type !== "draw" && preview.loggerId === id;
      if (store.get(selectedLoggerIdAtom) !== id && !hasPreview) return;
      store.set(loggerPreviewAtom, null);
      store.set(cursorStyleAtom, "default");
      if (store.get(modeAtom).mode === Mode.CONNECT_LOGGER)
        setMode({ mode: Mode.NONE });
    },
    [store, setMode],
  );

  const selectLogger = useCallback(
    (id: LoggerId | null) => {
      store.set(selectionAtom, USelection.none());
      store.set(selectedLoggerIdAtom, id);
      if (id !== null) showAssetPanel({ source: "draw" });
    },
    [store, showAssetPanel],
  );

  const updateLogger = useCallback(
    (id: LoggerId, update: (logger: Logger) => Logger): Promise<boolean> => {
      if (isEditionBlocked) return Promise.resolve(false);
      const settings = store.get(projectSettingsAtom);
      const loggers = settings.loggers ?? [];
      if (!loggers.some((logger) => logger.id === id))
        return Promise.resolve(false);
      return transact({
        ...settings,
        loggers: loggers.map((logger) =>
          logger.id === id ? update(logger) : logger,
        ),
      });
    },
    [store, transact, isEditionBlocked],
  );

  const addLogger = useCallback(
    async (coordinates: Position): Promise<LoggerId | null> => {
      if (isEditionBlocked) return null;
      const settings = store.get(projectSettingsAtom);
      const loggers = settings.loggers ?? [];
      const id = nanoid();
      const applied = await transact({
        ...settings,
        loggers: [
          ...loggers,
          {
            id,
            label: nextLoggerLabel(loggers, translate("logger")),
            coordinates: loggerCoordinates(coordinates),
            connection: null,
          },
        ],
      });
      if (!applied) return null;
      selectLogger(id);
      return id;
    },
    [store, transact, isEditionBlocked, selectLogger, translate],
  );

  const moveLogger = useCallback(
    (id: LoggerId, coordinates: Position) =>
      updateLogger(id, (logger) => ({
        ...logger,
        coordinates: loggerCoordinates(coordinates),
      })),
    [updateLogger],
  );

  const renameLogger = useCallback(
    (id: LoggerId, label: string) => {
      const loggers = store.get(projectSettingsAtom).loggers ?? [];
      if (!isLoggerLabelAvailable(loggers, id, label))
        return Promise.resolve(false);
      if (loggers.find((logger) => logger.id === id)?.label === label.trim())
        return Promise.resolve(false);
      return updateLogger(id, (logger) => ({ ...logger, label: label.trim() }));
    },
    [store, updateLogger],
  );

  const connectLogger = useCallback(
    (id: LoggerId, connection: LoggerConnection) => {
      const { assets } = store.get(stagingModelDerivedAtom);
      const resolved = resolveLoggerConnection(assets, connection);
      if (!resolved) return Promise.resolve(false);
      return updateLogger(id, (logger) => ({
        ...logger,
        connection: resolved,
      }));
    },
    [store, updateLogger],
  );

  const disconnectLogger = useCallback(
    async (id: LoggerId) => {
      const applied = await updateLogger(id, (logger) => ({
        ...logger,
        connection: null,
      }));
      if (applied) clearLoggerInteraction(id);
      return applied;
    },
    [updateLogger, clearLoggerInteraction],
  );

  const deleteLogger = useCallback(
    async (id: LoggerId): Promise<boolean> => {
      if (isEditionBlocked) return false;
      const settings = store.get(projectSettingsAtom);
      const loggers = settings.loggers ?? [];
      if (!loggers.some((logger) => logger.id === id)) return false;
      const applied = await transact({
        ...settings,
        loggers: loggers.filter((logger) => logger.id !== id),
      });
      if (applied) {
        clearLoggerInteraction(id);
        if (store.get(selectedLoggerIdAtom) === id)
          store.set(selectedLoggerIdAtom, null);
      }
      return applied;
    },
    [store, transact, isEditionBlocked, clearLoggerInteraction],
  );

  const startConnection = useCallback(
    (id: LoggerId) => {
      if (isEditionBlocked) return;
      if (
        !store
          .get(projectSettingsAtom)
          .loggers?.some((logger) => logger.id === id)
      )
        return;
      selectLogger(id);
      store.set(loggerPreviewAtom, null);
      store.set(cursorStyleAtom, "crosshair");
      setMode({ mode: Mode.CONNECT_LOGGER });
    },
    [store, isEditionBlocked, selectLogger, setMode],
  );

  const cancelConnection = useCallback(() => {
    store.set(loggerPreviewAtom, null);
    store.set(cursorStyleAtom, "default");
    setMode({ mode: Mode.NONE });
  }, [store, setMode]);

  return {
    addLogger,
    moveLogger,
    renameLogger,
    connectLogger,
    disconnectLogger,
    deleteLogger,
    selectLogger,
    startConnection,
    cancelConnection,
  };
};
