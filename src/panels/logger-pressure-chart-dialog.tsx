import { useEffect, useId, useRef } from "react";
import { useAtomValue } from "jotai";
import { Selector } from "@epanet-js/ui-kit";
import { BaseDialog, useDialogState } from "src/components/dialog";
import { Button } from "src/components/elements";
import { useLoggerHistoryActions } from "src/commands/logger-history";
import { useTranslate } from "src/hooks/use-translate";
import { useLoggerPressureComparison } from "src/hooks/use-logger-pressure-comparison";
import { CloseIcon } from "src/icons";
import {
  loggerHistoryDefaultsAtom,
  loggerHistoryViewsAtom,
} from "src/state/logger-history";
import { loggerStreamsAtom } from "src/state/logger-stream";
import { loggersAtom } from "src/state/loggers";
import { LoggerPressureChart } from "./logger-pressure-chart";

export function LoggerPressureChartDialog({ loggerId }: { loggerId: string }) {
  const translate = useTranslate();
  const { closeDialog } = useDialogState();
  const { setLoggerHistoryInterval } = useLoggerHistoryActions();
  const logger = useAtomValue(loggersAtom).find((item) => item.id === loggerId);
  const streams = useAtomValue(loggerStreamsAtom);
  const historyViews = useAtomValue(loggerHistoryViewsAtom);
  const defaults = useAtomValue(loggerHistoryDefaultsAtom);
  const view = historyViews.get(loggerId) ?? defaults;
  const stream = streams.get(loggerId);
  const isHistory = view.mode === "history";
  const interval = view.loadedInterval ?? view.interval;
  const history = isHistory
    ? view.samples
    : (stream?.history ?? defaults.samples);
  const comparison = useLoggerPressureComparison(
    loggerId,
    history,
    isHistory ? interval : null,
  );
  const intervalId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, []);

  const emptyMessage = isHistory
    ? translate(
        view.status === "loading"
          ? "loggers.stream.historyMode.loading"
          : view.loadedRange
            ? interval === "minute"
              ? "loggers.stream.historyMode.emptyMinute"
              : "loggers.stream.historyMode.empty"
            : "loggers.stream.historyMode.notLoaded",
      )
    : undefined;

  return (
    <BaseDialog
      title={`${logger?.label ?? translate("logger")} · ${translate("loggers.stream.history.expandedTitle")}`}
      size="auto"
      contentStyle={{ width: "80vw", height: "80dvh", maxHeight: "80dvh" }}
      overlayClassName="backdrop-blur-md"
      isOpen={true}
      onClose={closeDialog}
    >
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b px-5 py-3">
        <p className="min-w-48 flex-1 self-center text-size-small text-subtle">
          {translate("loggers.stream.history.overviewHint")}
        </p>
        {isHistory ? (
          <div className="w-44 space-y-1.5">
            <label
              htmlFor={intervalId}
              className="block text-size-small text-subtle"
            >
              {translate("loggers.stream.historyMode.sampling")}
            </label>
            <Selector
              id={intervalId}
              ariaLabel={translate("loggers.stream.historyMode.sampling")}
              selected={view.interval}
              options={[
                {
                  value: "hourly",
                  label: translate("loggers.stream.historyMode.intervalHourly"),
                },
                {
                  value: "minute",
                  label: translate("loggers.stream.historyMode.intervalMinute"),
                },
              ]}
              onChange={(value) => {
                if (value === "hourly" || value === "minute")
                  setLoggerHistoryInterval(loggerId, value);
              }}
              triggerClassName="h-11 w-full rounded-md"
            />
          </div>
        ) : (
          <span className="py-3 text-size-small text-subtle">
            {translate("loggers.stream.historyMode.realtime")}
          </span>
        )}
        <Button
          type="button"
          variant="default"
          autoFocus={true}
          onClick={closeDialog}
          className="min-h-11 justify-center gap-2 rounded-md"
        >
          <CloseIcon />
          {translate("loggers.stream.history.closeExpanded")}
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <LoggerPressureChart
          comparison={comparison}
          history={history}
          mode={isHistory ? "history" : "realtime"}
          historyRange={isHistory ? view.loadedRange : null}
          historyDeviceId={isHistory ? view.loadedDeviceId : null}
          historySampleLimit={isHistory ? view.loadedSampleLimit : null}
          historyInterval={isHistory ? interval : null}
          emptyMessage={emptyMessage}
          expanded={true}
        />
      </div>
    </BaseDialog>
  );
}
