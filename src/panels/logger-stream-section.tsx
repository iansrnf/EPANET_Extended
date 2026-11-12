import { useId } from "react";
import { useAtomValue } from "jotai";
import clsx from "clsx";
import noop from "lodash/noop";
import { Selector } from "@epanet-js/ui-kit";
import { useLoggerStreamActions } from "src/commands/logger-stream";
import { useLoggerHistoryActions } from "src/commands/logger-history";
import { Button, Input } from "src/components/elements";
import { useLocale } from "src/hooks/use-locale";
import { useLoggerPressureComparison } from "src/hooks/use-logger-pressure-comparison";
import { useTranslate } from "src/hooks/use-translate";
import { PlayIcon, StopIcon } from "src/icons";
import {
  formatLoggerPressure,
  formatLoggerTimestamp,
} from "src/lib/logger-stream";
import { selectedLoggerStreamAtom } from "src/state/logger-stream";
import { selectedLoggerHistoryViewAtom } from "src/state/logger-history";
import { LoggerHistoryControls } from "./logger-history-controls";
import { LoggerPressureChart } from "./logger-pressure-chart";

export function LoggerStreamSection({ loggerId }: { loggerId: string }) {
  const stream = useAtomValue(selectedLoggerStreamAtom);
  const historyView = useAtomValue(selectedLoggerHistoryViewAtom);
  const isHistory = historyView?.mode === "history";
  const history = isHistory
    ? (historyView?.samples ?? [])
    : (stream?.history ?? []);
  const historyInterval = isHistory
    ? (historyView?.loadedInterval ?? historyView?.interval)
    : null;
  const comparison = useLoggerPressureComparison(
    loggerId,
    history,
    historyInterval,
  );
  const { toggleLoggerStream, setLoggerDeviceId } = useLoggerStreamActions();
  const { expandLoggerPressureChart } = useLoggerHistoryActions();
  const translate = useTranslate();
  const { locale } = useLocale();
  const headingId = useId();
  const typeId = useId();
  const deviceId = useId();

  if (!stream) return null;

  const reading = stream.reading;
  const pressure = reading?.pressure;
  const hasPressure = typeof pressure === "number";
  const isConnected = stream.status === "connected";
  const isPending =
    stream.status === "connecting" || stream.status === "reconnecting";
  const formatTelemetry = (value: number | string | null | undefined) =>
    typeof value === "number"
      ? new Intl.NumberFormat(locale, {
          useGrouping: false,
          maximumFractionDigits: 2,
        }).format(value)
      : (value ?? "—");

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border bg-panel px-3 py-3 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="font-semibold text-size-base">
          {translate("loggers.stream.title")}
        </h2>
        <span
          role="status"
          className={clsx(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-size-small",
            isConnected
              ? "bg-success-subtle text-success"
              : isPending
                ? "bg-info-subtle text-info"
                : stream.status === "error"
                  ? "bg-error-subtle text-error"
                  : "bg-base text-subtle",
          )}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-current"
          />
          {translate(`loggers.stream.status.${stream.status}`)}
        </span>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={typeId} className="block text-size-small text-subtle">
          {translate("loggers.stream.loggerType")}
        </label>
        <div className="flex gap-2 items-stretch">
          <div className="min-w-0 flex-1">
            <Selector
              id={typeId}
              ariaLabel={translate("loggers.stream.loggerType")}
              selected={stream.loggerType}
              options={[
                {
                  label: translate("loggers.stream.defaultXilog"),
                  value: "xilog-plus-2i",
                },
              ]}
              onChange={noop}
              disabled={stream.isRunning}
              triggerClassName="h-11 rounded-md"
            />
          </div>
          <Button
            type="button"
            variant={stream.isRunning ? "default" : "primary"}
            aria-pressed={stream.isRunning}
            aria-label={translate(
              stream.isRunning
                ? "loggers.stream.stopLabel"
                : "loggers.stream.runLabel",
            )}
            onClick={() => void toggleLoggerStream(loggerId)}
            disabled={!stream.isRunning && !stream.deviceId.trim()}
            className="min-h-11 min-w-20 shrink-0 justify-center gap-1.5 rounded-md"
          >
            {stream.isRunning ? <StopIcon /> : <PlayIcon />}
            {translate(
              stream.isRunning ? "loggers.stream.stop" : "loggers.stream.run",
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={deviceId} className="block text-size-small text-subtle">
          {translate("loggers.stream.deviceId")}
        </label>
        <Input
          id={deviceId}
          value={stream.deviceId}
          onChange={(event) => setLoggerDeviceId(loggerId, event.target.value)}
          disabled={stream.isRunning}
          autoComplete="off"
          spellCheck={false}
          placeholder="L1"
          className="h-11 rounded-md bg-base font-mono"
        />
      </div>

      {stream.error && (
        <p role="alert" className="text-size-small text-error">
          {translate(`loggers.stream.errors.${stream.error}`)}
        </p>
      )}

      <LoggerHistoryControls loggerId={loggerId} />

      {isHistory && stream.isRunning && (
        <p className="text-size-small text-subtle">
          {translate("loggers.stream.historyMode.streamContinues")}
        </p>
      )}

      <div className="overflow-hidden rounded-md border bg-base">
        <div className="px-3 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-size-small text-subtle">
              {translate(
                isHistory
                  ? "loggers.stream.historyMode.currentPressure"
                  : "loggers.stream.pressure",
              )}
            </span>
            {reading?.status && (
              <span
                aria-label={`${translate("loggers.stream.deviceStatus")}: ${reading.status}`}
                className={clsx(
                  "rounded-full px-2 py-0.5 text-size-small",
                  reading.status.toLowerCase() === "online"
                    ? "bg-success-subtle text-success"
                    : "bg-warning-subtle text-warning",
                )}
              >
                {reading.status}
              </span>
            )}
          </div>
          <output
            aria-label={translate("loggers.stream.pressure")}
            aria-live="off"
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums"
          >
            <span className="font-mono font-semibold text-size-heading-1 tracking-tight leading-none">
              {hasPressure ? formatLoggerPressure(pressure, locale) : "—"}
            </span>
            <span className="text-size-base text-subtle">psi</span>
          </output>
          {reading ? (
            <p className="text-size-small text-subtle break-all">
              {translate("loggers.stream.sourceDevice", reading.deviceId)}
            </p>
          ) : (
            <p className="text-size-small text-subtle">
              {translate("loggers.stream.noReading")}
            </p>
          )}
          {!hasPressure && (
            <p className="text-size-small text-subtle">
              {translate(
                reading
                  ? "loggers.stream.waitingPressure"
                  : "loggers.stream.waiting",
              )}
            </p>
          )}
        </div>

        <LoggerPressureChart
          comparison={comparison}
          onExpand={() => expandLoggerPressureChart(loggerId)}
          history={history}
          mode={isHistory ? "history" : "realtime"}
          historyRange={isHistory ? historyView?.loadedRange : null}
          historyDeviceId={isHistory ? historyView?.loadedDeviceId : null}
          historySampleLimit={isHistory ? historyView?.loadedSampleLimit : null}
          historyInterval={historyInterval}
          emptyMessage={
            isHistory && historyView
              ? translate(
                  historyView.status === "loading"
                    ? "loggers.stream.historyMode.loading"
                    : historyView.loadedRange
                      ? historyView.loadedInterval === "minute"
                        ? "loggers.stream.historyMode.emptyMinute"
                        : "loggers.stream.historyMode.empty"
                      : "loggers.stream.historyMode.notLoaded",
                )
              : undefined
          }
        />

        {reading && (
          <>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-t px-3 py-3 text-size-small">
              <TelemetryValue
                label={translate("loggers.stream.battery")}
                value={formatTelemetry(reading.battery_v)}
                unit={reading.battery_v != null ? "V" : undefined}
              />
              <TelemetryValue
                label={translate("loggers.stream.external")}
                value={formatTelemetry(reading.external_v)}
                unit={reading.external_v != null ? "V" : undefined}
              />
              <TelemetryValue
                label={translate("loggers.stream.gsm")}
                value={formatTelemetry(reading.gsm_pct)}
                unit={reading.gsm_pct != null ? "%" : undefined}
              />
              <TelemetryValue
                label={translate("loggers.stream.temperatureOrStatus")}
                value={formatTelemetry(reading.temp_or_status)}
              />
            </dl>
            <dl className="space-y-2 border-t px-3 py-3 text-size-small">
              {reading.pressureTimestamp && (
                <ReadingTime
                  label={translate("loggers.stream.pressureAt")}
                  timestamp={reading.pressureTimestamp}
                />
              )}
              <ReadingTime
                label={translate("loggers.stream.lastPacket")}
                timestamp={reading.timestamp}
              />
            </dl>
            {reading.raw != null && (
              <details className="border-t px-3 py-2 text-size-small">
                <summary className="cursor-pointer text-subtle focus-visible:ring-1 focus-visible:ring-accent rounded-sm">
                  {translate("loggers.stream.raw")}
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-default">
                  {reading.raw}
                </pre>
              </details>
            )}
          </>
        )}
      </div>
      {hasPressure && !stream.isRunning && (
        <p className="text-size-small text-subtle">
          {translate("loggers.stream.retained")}
        </p>
      )}
    </section>
  );
}

function TelemetryValue({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-subtle">{label}</dt>
      <dd className="font-medium tabular-nums break-words">
        {value}
        {unit && <span className="ml-1 text-subtle">{unit}</span>}
      </dd>
    </div>
  );
}

function ReadingTime({
  label,
  timestamp,
}: {
  label: string;
  timestamp: string;
}) {
  const { locale } = useLocale();
  return (
    <div className="space-y-0.5">
      <dt className="text-subtle">{label}</dt>
      <dd className="tabular-nums break-words">
        <time dateTime={timestamp}>
          {formatLoggerTimestamp(timestamp, locale)}
        </time>
      </dd>
    </div>
  );
}
