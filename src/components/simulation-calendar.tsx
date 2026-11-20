import { useId, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Tooltip } from "@epanet-js/ui-kit";
import clsx from "clsx";
import { useLocale } from "src/hooks/use-locale";
import { useTranslate } from "src/hooks/use-translate";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
} from "src/icons";
import {
  getCalendarDays,
  getTimelineDate,
  getTimestepForDate,
  formatLocalDateTimeInput,
  parseLocalDateTimeInput,
} from "src/lib/simulation-timeline";
import type { SimulationTimingPreset } from "src/lib/simulation-timing-presets";

export const SimulationCalendar = ({
  startDate,
  fromDate = startDate,
  onStartDateChange,
  currentTimestepIndex,
  timestepCount,
  intervalSeconds,
  durationSeconds,
  hasResults,
  timingPreset,
  onTimingPresetChange,
  onSelectTimestep,
  onOpen,
  disabled = false,
  timingReadonly = false,
}: {
  startDate: Date;
  fromDate?: Date;
  onStartDateChange: (date: Date) => void;
  currentTimestepIndex: number;
  timestepCount: number;
  intervalSeconds: number;
  durationSeconds: number;
  hasResults: boolean;
  timingPreset: SimulationTimingPreset;
  onTimingPresetChange: (preset: SimulationTimingPreset) => void;
  onSelectTimestep: (index: number) => void;
  onOpen?: () => void;
  disabled?: boolean;
  timingReadonly?: boolean;
}) => {
  const translate = useTranslate();
  const { locale } = useLocale();
  const selectedDate = getTimelineDate(
    startDate,
    currentTimestepIndex,
    intervalSeconds,
  );
  const endDate =
    durationSeconds > 0
      ? getTimelineDate(fromDate, 1, durationSeconds)
      : fromDate;
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(selectedDate);
  const selectedDayRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const monthId = useId();
  const startDateId = useId();
  const endDateId = useId();
  const intervalId = useId();
  const days = getCalendarDays(viewMonth);
  const fullDateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const weekdayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
  });
  const weekdayNameFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
  });
  const numberFormatter = new Intl.NumberFormat(locale);
  const today = dateInputValue(new Date());
  const selectedDay = dateInputValue(selectedDate);
  const calendarDateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(selectedDate);
  const calendarTimeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second:
      timingPreset === "seconds" || selectedDate.getSeconds() !== 0
        ? "2-digit"
        : undefined,
    hourCycle: "h23",
  }).format(selectedDate);

  const changeStartDate = (date: Date) => {
    onStartDateChange(date);
    setViewMonth(hasResults ? selectedDate : date);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setViewMonth(selectedDate);
          onOpen?.();
        }
        setOpen(nextOpen);
      }}
    >
      <Tooltip content={translate("simulationTimeline.calendar")} side="top">
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${translate("simulationTimeline.calendar")}: ${calendarDateLabel} ${calendarTimeLabel}`}
            className="pointer-events-auto flex h-[var(--map-control-target-size)] min-w-0 max-w-full items-center justify-center rounded-sm transition-[filter] enabled:hover:brightness-110 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed"
            onKeyDown={(event) => event.stopPropagation()}
            onKeyPress={(event) => event.stopPropagation()}
            onKeyUp={(event) => event.stopPropagation()}
          >
            <span
              className={clsx(
                "flex h-[var(--map-control-face-size)] min-w-0 items-center gap-1 rounded-sm border bg-popover-inverse/40 px-2 text-size-small font-semibold text-default-inverse shadow-md",
                open ? "border-accent" : "border-transparent",
              )}
              style={{ textShadow: "none" }}
            >
              <span className="min-w-0 truncate">{calendarDateLabel}</span>
              <time
                dateTime={calendarTimeLabel}
                className="shrink-0 tabular-nums"
              >
                {calendarTimeLabel}
              </time>
              <ChevronDownIcon
                size="sm"
                aria-hidden="true"
                className="h-[var(--map-control-icon-size)] w-[var(--map-control-icon-size)] shrink-0"
                style={{ filter: "none" }}
              />
            </span>
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="z-50 w-[336px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border bg-popover p-3 text-size-small text-default shadow-xl outline-none"
          style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
          onOpenAutoFocus={(event) => {
            if (!selectedDayRef.current) return;
            event.preventDefault();
            selectedDayRef.current.focus();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onKeyPress={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id={titleId} className="px-1 text-size-base font-semibold">
              {translate("simulationTimeline.calendar")}
            </h2>
            <Popover.Close asChild>
              <button
                type="button"
                aria-label={translate("simulationTimeline.closeCalendar")}
                className={calendarIconButtonClass}
              >
                <CloseIcon aria-hidden="true" />
              </button>
            </Popover.Close>
          </div>
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              aria-label={translate("simulationTimeline.previousMonth")}
              className={calendarIconButtonClass}
              onClick={() => {
                setViewMonth(
                  new Date(
                    viewMonth.getFullYear(),
                    viewMonth.getMonth() - 1,
                    1,
                  ),
                );
              }}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </button>
            <div id={monthId} className="font-semibold" aria-live="polite">
              {new Intl.DateTimeFormat(locale, {
                month: "long",
                year: "numeric",
              }).format(viewMonth)}
            </div>
            <button
              type="button"
              aria-label={translate("simulationTimeline.nextMonth")}
              className={calendarIconButtonClass}
              onClick={() => {
                setViewMonth(
                  new Date(
                    viewMonth.getFullYear(),
                    viewMonth.getMonth() + 1,
                    1,
                  ),
                );
              }}
            >
              <ChevronRightIcon aria-hidden="true" />
            </button>
          </div>
          <table className="w-full table-fixed" aria-labelledby={monthId}>
            <thead>
              <tr>
                {days.slice(0, 7).map((date) => (
                  <th
                    key={date.getDay()}
                    scope="col"
                    className="h-8 text-center font-medium text-subtle"
                  >
                    <abbr
                      className="no-underline"
                      title={weekdayNameFormatter.format(date)}
                    >
                      {weekdayFormatter.format(date)}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, week) => (
                <tr key={week}>
                  {days.slice(week * 7, week * 7 + 7).map((date) => {
                    const day = dateInputValue(date);
                    const isSelected = day === selectedDay;
                    const timestep = getTimestepForDate(
                      date,
                      startDate,
                      currentTimestepIndex,
                      timestepCount,
                      intervalSeconds,
                    );

                    return (
                      <td key={day} className="p-0">
                        <button
                          ref={isSelected ? selectedDayRef : undefined}
                          type="button"
                          aria-label={fullDateFormatter.format(date)}
                          aria-pressed={isSelected}
                          aria-current={day === today ? "date" : undefined}
                          disabled={
                            disabled || (hasResults && timestep === null)
                          }
                          className={clsx(
                            "flex min-h-11 w-full items-center justify-center rounded-lg border tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40",
                            isSelected
                              ? "bg-accent font-semibold text-white"
                              : "hover:bg-base-hover",
                            !isSelected && day === today
                              ? "border-accent text-accent"
                              : "border-transparent",
                            !isSelected &&
                              date.getMonth() !== viewMonth.getMonth() &&
                              "text-subtle",
                          )}
                          onClick={() => {
                            if (!hasResults) {
                              const nextStartDate = new Date(fromDate);
                              nextStartDate.setFullYear(
                                date.getFullYear(),
                                date.getMonth(),
                                date.getDate(),
                              );
                              changeStartDate(nextStartDate);
                              return;
                            }
                            if (timestep === null) return;
                            onSelectTimestep(timestep);
                            setOpen(false);
                          }}
                        >
                          <time dateTime={day}>
                            {numberFormatter.format(date.getDate())}
                          </time>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 border-t pt-3">
            <label htmlFor={startDateId} className="mb-1.5 block font-medium">
              {translate("simulationTimeline.from")}
            </label>
            <div className="flex items-center gap-1">
              <input
                id={startDateId}
                type="datetime-local"
                step={1}
                value={formatLocalDateTimeInput(fromDate)}
                disabled={disabled}
                aria-describedby={descriptionId}
                className="min-h-11 min-w-0 flex-1 rounded-lg border bg-base px-2 text-size-small text-default focus-visible:outline-2 focus-visible:outline-accent disabled:text-disabled"
                onChange={(event) => {
                  const nextStartDate = parseLocalDateTimeInput(
                    event.currentTarget.value,
                  );
                  if (nextStartDate) changeStartDate(nextStartDate);
                }}
              />
              <Tooltip
                content={translate("simulationTimeline.useNow")}
                side="top"
              >
                <button
                  type="button"
                  aria-label={translate("simulationTimeline.useNow")}
                  className={calendarIconButtonClass}
                  disabled={disabled}
                  onClick={() =>
                    changeStartDate(
                      new Date(Math.round(Date.now() / 1000) * 1000),
                    )
                  }
                >
                  <ClockIcon aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
            <label
              htmlFor={endDateId}
              className="mb-1.5 mt-3 block font-medium"
            >
              {translate("simulationTimeline.to")}
            </label>
            <output
              id={endDateId}
              className="block rounded-lg bg-panel px-2 py-2.5 tabular-nums"
            >
              <time dateTime={endDate.toISOString()}>
                {new Intl.DateTimeFormat(locale, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hourCycle: "h23",
                }).format(endDate)}
              </time>
            </output>
            <label
              htmlFor={intervalId}
              className="mb-1.5 mt-3 block font-medium"
            >
              {translate("simulationTimeline.interval")}
            </label>
            <select
              id={intervalId}
              value={timingPreset}
              disabled={disabled || timingReadonly}
              className="min-h-11 w-full rounded-lg border bg-base px-3 text-size-base text-default focus-visible:outline-2 focus-visible:outline-accent disabled:text-disabled"
              onChange={(event) => {
                const preset = event.currentTarget.value;
                if (
                  preset === "hourly" ||
                  preset === "minutes" ||
                  preset === "seconds"
                )
                  onTimingPresetChange(preset);
              }}
            >
              <option value="hourly">
                {translate("simulationSettings.timingPreset.hourly")}
              </option>
              <option value="minutes">
                {translate("simulationSettings.timingPreset.minutes")}
              </option>
              <option value="seconds">
                {translate("simulationSettings.timingPreset.seconds")}
              </option>
            </select>
            <p id={descriptionId} className="mt-2 text-subtle">
              {translate("simulationTimeline.calendarDescription")}
            </p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

const calendarIconButtonClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-base-hover hover:text-default focus-visible:outline-2 focus-visible:outline-accent";

const dateInputValue = (date: Date) =>
  [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
