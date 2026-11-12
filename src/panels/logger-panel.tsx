import { useCallback, useState } from "react";
import { useAtomValue } from "jotai";
import { Maybe } from "purify-ts/Maybe";
import { Tooltip } from "@epanet-js/ui-kit";
import { useLoggerActions } from "src/commands/logger-actions";
import {
  connectCustomersShortcut as connectLoggerShortcut,
  disconnectCustomersShortcut as disconnectLoggerShortcut,
} from "src/commands/customer-point-actions";
import { Action } from "src/components/action-button";
import { ActionsBar } from "src/components/actions-bar";
import { Button, Keycap } from "src/components/elements";
import { EditableTextField } from "src/components/form/editable-text-field";
import { SectionList } from "src/components/form/fields";
import { useIsDrawingAvailable } from "src/hooks/use-is-drawing-available";
import { useIsEditionBlocked } from "src/hooks/use-is-edition-blocked";
import { useTranslate } from "src/hooks/use-translate";
import { useZoomTo } from "src/hooks/use-zoom-to";
import { localizeKeybinding } from "src/infra/i18n";
import {
  isLoggerLabelAvailable,
  MAX_LOGGER_LABEL_LENGTH,
} from "src/lib/loggers";
import {
  ConnectIcon,
  CloseIcon,
  DeleteIcon,
  DisconnectIcon,
  LoggerIcon,
  ZoomToIcon,
} from "src/icons";
import { stagingModelDerivedAtom } from "src/state/derived-branch-state";
import { loggersAtom, selectedLoggerAtom } from "src/state/loggers";
import { modeAtom, Mode } from "src/state/mode";
import { BBox } from "src/types";
import { SectionWrapper, TextRow } from "./asset-panel/ui-components";
import { LoggerStreamSection } from "./logger-stream-section";

export function LoggerPanel() {
  const logger = useAtomValue(selectedLoggerAtom);

  return logger ? <LoggerEditor key={logger.id} /> : null;
}

function LoggerEditor() {
  const logger = useAtomValue(selectedLoggerAtom);
  const loggers = useAtomValue(loggersAtom);
  const hydraulicModel = useAtomValue(stagingModelDerivedAtom);
  const { mode } = useAtomValue(modeAtom);
  const actions = useLoggerActions();
  const translate = useTranslate();
  const zoomTo = useZoomTo();
  const isEditionBlocked = useIsEditionBlocked();
  const isDrawingAvailable = useIsDrawingAvailable();
  const [labelError, setLabelError] = useState<string | null>(null);
  const [isConnectionPending, setConnectionPending] = useState(false);

  const clearLabelError = useCallback(() => setLabelError(null), []);

  const handleLabelChange = useCallback(
    (label: string): boolean => {
      if (!logger || isEditionBlocked) return false;
      const nextLabel = label.trim();

      if (!nextLabel) {
        setLabelError(translate("loggers.emptyLabel"));
        return true;
      }

      if (!isLoggerLabelAvailable(loggers, logger.id, nextLabel)) {
        setLabelError(translate("loggers.duplicateLabel"));
        return true;
      }

      setLabelError(null);
      void actions.renameLogger(logger.id, nextLabel);
      return false;
    },
    [logger, loggers, isEditionBlocked, translate, actions],
  );

  const handleQuickConnection = useCallback(async () => {
    if (!logger || isConnectionPending) return;
    if (mode === Mode.CONNECT_LOGGER) {
      actions.cancelConnection();
      return;
    }
    if (isEditionBlocked) return;
    if (!logger.connection) {
      if (isDrawingAvailable) actions.startConnection(logger.id);
      return;
    }
    setConnectionPending(true);
    try {
      await actions.disconnectLogger(logger.id);
    } finally {
      setConnectionPending(false);
    }
  }, [
    logger,
    isConnectionPending,
    mode,
    actions,
    isEditionBlocked,
    isDrawingAvailable,
  ]);

  if (!logger) return null;

  const connection = logger.connection;
  const connectedAsset = connection
    ? hydraulicModel.assets.get(connection.assetId)
    : undefined;
  const isConnecting = mode === Mode.CONNECT_LOGGER;
  const canConnect = !isEditionBlocked && isDrawingAvailable;
  const quickConnectionLabel = translate(
    isConnecting
      ? "loggers.cancelConnection"
      : connection
        ? "loggers.disconnectShortcut"
        : "loggers.connectShortcut",
  );
  const quickConnectionShortcut = isConnecting
    ? "esc"
    : connection
      ? disconnectLoggerShortcut
      : connectLoggerShortcut;
  const isQuickConnectionDisabled =
    isConnectionPending ||
    (!isConnecting &&
      (isEditionBlocked || (!connection && !isDrawingAvailable)));

  const headerActions: Action[] = [
    {
      label: translate("zoomTo"),
      icon: <ZoomToIcon />,
      applicable: true,
      priority: 1,
      onSelect: () => {
        const [lng, lat] = logger.coordinates;
        zoomTo(Maybe.of([lng, lat, lng, lat] as BBox));
        return Promise.resolve();
      },
    },
    {
      label: translate("delete"),
      icon: <DeleteIcon />,
      applicable: true,
      priority: 2,
      variant: "danger-quiet",
      disabled: isEditionBlocked,
      onSelect: async () => {
        await actions.deleteLogger(logger.id);
      },
    },
  ];

  return (
    <div className="flex flex-col h-full grow overflow-hidden">
      <div className="px-3 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <EditableTextField
              label={translate("logger")}
              value={logger.label}
              onChangeValue={handleLabelChange}
              onReset={clearLabelError}
              onDirty={clearLabelError}
              hasError={!!labelError}
              allowEmpty
              readOnly={isEditionBlocked}
              sanitize={(raw) => raw.slice(0, MAX_LOGGER_LABEL_LENGTH)}
              styleOptions={{
                padding: "sm",
                ghostBorder: true,
                fontWeight: "semibold",
                textSize: "sm",
              }}
            />
          </div>
          <div className="flex shrink-0 items-center">
            <Tooltip
              content={
                <div className="flex items-center gap-2 whitespace-nowrap">
                  {quickConnectionLabel}
                  <Keycap size="xs">
                    {localizeKeybinding(quickConnectionShortcut)}
                  </Keycap>
                </div>
              }
            >
              <Button
                type="button"
                variant={isConnecting ? "quiet/mode" : "quiet"}
                aria-label={quickConnectionLabel}
                aria-keyshortcuts={
                  isConnecting ? "Escape" : connection ? "Shift+D" : "Shift+C"
                }
                aria-busy={isConnectionPending}
                disabled={isQuickConnectionDisabled}
                onClick={() => void handleQuickConnection()}
                className="min-h-11 min-w-11 shrink-0 justify-center rounded-md"
              >
                {isConnecting ? (
                  <CloseIcon />
                ) : connection ? (
                  <DisconnectIcon />
                ) : (
                  <ConnectIcon />
                )}
              </Button>
            </Tooltip>
            <ActionsBar
              actions={headerActions}
              className="h-11 items-center"
              minWidth={0}
            />
          </div>
        </div>
        {labelError && (
          <span
            role="alert"
            className="text-size-small text-warning block mt-1 pl-1"
          >
            {labelError}
          </span>
        )}
        <span className="flex gap-1 items-center text-size-base text-subtle pl-1">
          <LoggerIcon />
          {translate("logger")}
        </span>
      </div>
      <SectionList padding={3} overflow>
        <LoggerStreamSection loggerId={logger.id} />
        <SectionWrapper title={translate("connections")} section="connections">
          {connectedAsset ? (
            <TextRow name={connectedAsset.type} value={connectedAsset.label} />
          ) : (
            <p className="text-size-base text-subtle px-2 py-2">
              {translate(
                connection
                  ? "loggers.missingConnection"
                  : "loggers.notConnected",
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2 px-2 py-2">
            {isConnecting ? (
              <Button variant="default" onClick={actions.cancelConnection}>
                {translate("cancel")}
              </Button>
            ) : (
              <Button
                variant="default"
                disabled={!canConnect}
                onClick={() => actions.startConnection(logger.id)}
              >
                <ConnectIcon />
                {translate(
                  connection ? "loggers.reconnect" : "loggers.connect",
                )}
              </Button>
            )}
            {connection && (
              <Button
                variant="quiet"
                disabled={isEditionBlocked}
                onClick={() => void actions.disconnectLogger(logger.id)}
              >
                <DisconnectIcon />
                {translate("loggers.disconnect")}
              </Button>
            )}
          </div>
          {isConnecting && (
            <p role="status" className="text-size-base text-subtle px-2 pb-2">
              {translate("loggers.connectHint")}
            </p>
          )}
        </SectionWrapper>
      </SectionList>
    </div>
  );
}
