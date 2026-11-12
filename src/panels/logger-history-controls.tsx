import { useId } from "react";
import { useAtomValue } from "jotai";
import clsx from "clsx";
import { Selector } from "@epanet-js/ui-kit";
import { useLoggerHistoryActions } from "src/commands/logger-history";
import { Button, Input } from "src/components/elements";
import { useTranslate } from "src/hooks/use-translate";
import { RefreshIcon } from "src/icons";
import { selectedLoggerHistoryViewAtom } from "src/state/logger-history";

export function LoggerHistoryControls({ loggerId }: { loggerId: string }) {
  const view = useAtomValue(selectedLoggerHistoryViewAtom);
  const {
    setLoggerHistoryMode,
    setLoggerHistoryRange,
    setLoggerHistorySampling,
    setLoggerHistoryInterval,
    loadLoggerHistory,
  } = useLoggerHistoryActions();
  const translate = useTranslate();
  const fromId = useId();
  const toId = useId();
  const samplesId = useId();
  const intervalId = useId();
  const customSamplesId = useId();
  const helpId = useId();
  const errorId = useId();

  if (!view) return null;

  const isLoading = view.status === "loading";
  const isHistory = view.mode === "history";

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label={translate("loggers.stream.historyMode.label")}
        className="grid grid-cols-2 gap-1 rounded-lg border bg-base p-1"
      >
        {(["realtime", "history"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={view.mode === mode}
            onClick={() => setLoggerHistoryMode(loggerId, mode)}
            className={clsx(
              "min-h-11 rounded-md px-2 text-size-small font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              view.mode === mode
                ? "bg-panel text-default shadow-sm"
                : "text-subtle hover:text-default",
            )}
          >
            {translate(`loggers.stream.historyMode.${mode}`)}
          </button>
        ))}
      </div>

      {isHistory && (
        <form
          aria-busy={isLoading}
          aria-describedby={helpId}
          className="space-y-3 rounded-md border bg-base p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void loadLoggerHistory(loggerId);
          }}
        >
          <div className="space-y-1.5">
            <label
              htmlFor={fromId}
              className="block text-size-small text-subtle"
            >
              {translate("loggers.stream.historyMode.from")}
            </label>
            <Input
              id={fromId}
              type="datetime-local"
              step="1"
              value={view.from}
              onChange={(event) =>
                setLoggerHistoryRange(loggerId, "from", event.target.value)
              }
              disabled={isLoading}
              aria-describedby={view.error ? errorId : helpId}
              className="h-11 min-w-0 w-full rounded-md bg-panel text-size-small tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={toId} className="block text-size-small text-subtle">
              {translate("loggers.stream.historyMode.to")}
            </label>
            <Input
              id={toId}
              type="datetime-local"
              step="1"
              value={view.to}
              onChange={(event) =>
                setLoggerHistoryRange(loggerId, "to", event.target.value)
              }
              disabled={isLoading}
              aria-describedby={view.error ? errorId : helpId}
              className="h-11 min-w-0 w-full rounded-md bg-panel text-size-small tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
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
              triggerClassName="h-11 w-full rounded-md bg-panel"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor={samplesId}
              className="block text-size-small text-subtle"
            >
              {translate("loggers.stream.historyMode.samples")}
            </label>
            <Selector
              id={samplesId}
              ariaLabel={translate("loggers.stream.historyMode.samples")}
              selected={view.sampleLimit}
              options={[
                ...(["10", "24", "100", "150"] as const).map((value) => ({
                  value,
                  label: translate(
                    "loggers.stream.historyMode.sampleOption",
                    value,
                  ),
                })),
                {
                  value: "custom",
                  label: translate("loggers.stream.historyMode.sampleCustom"),
                },
                {
                  value: "all",
                  label: translate("loggers.stream.historyMode.sampleAll"),
                },
              ]}
              onChange={(value) =>
                setLoggerHistorySampling(loggerId, "sampleLimit", value)
              }
              triggerClassName="h-11 w-full rounded-md bg-panel"
            />
          </div>
          {view.sampleLimit === "custom" && (
            <div className="space-y-1.5">
              <label
                htmlFor={customSamplesId}
                className="block text-size-small text-subtle"
              >
                {translate("loggers.stream.historyMode.customSampleCount")}
              </label>
              <Input
                id={customSamplesId}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={view.customSampleLimit}
                onChange={(event) =>
                  setLoggerHistorySampling(
                    loggerId,
                    "customSampleLimit",
                    event.target.value,
                  )
                }
                aria-describedby={view.error ? errorId : helpId}
                aria-invalid={view.error === "invalidSampleLimit"}
                className="h-11 min-w-0 w-full rounded-md bg-panel text-size-small tabular-nums"
              />
            </div>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={isLoading}
            className="min-h-11 w-full justify-center gap-2 rounded-md"
          >
            {isLoading && <RefreshIcon className="animate-spin" />}
            {translate(
              isLoading
                ? "loggers.stream.historyMode.loading"
                : "loggers.stream.historyMode.load",
            )}
          </Button>
          <p
            id={helpId}
            className="text-size-small leading-relaxed text-subtle"
          >
            {translate(
              view.interval === "minute"
                ? "loggers.stream.historyMode.minuteRule"
                : "loggers.stream.historyMode.hourlyRule",
            )}
          </p>
          {view.error && (
            <p id={errorId} role="alert" className="text-size-small text-error">
              {translate(`loggers.stream.historyMode.errors.${view.error}`)}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
