export type TimelineTick = { index: number; elapsedSeconds: number };

export const getTimelineProgress = (
  index: number,
  timestepCount: number,
): number => {
  if (
    !Number.isFinite(index) ||
    !Number.isSafeInteger(timestepCount) ||
    timestepCount <= 1
  )
    return 0;
  return Math.max(0, Math.min(1, index / (timestepCount - 1)));
};

export const getTimelineProgressAtPosition = (
  pointerX: number,
  trackLeft: number,
  trackWidth: number,
): number => {
  if (
    !Number.isFinite(pointerX) ||
    !Number.isFinite(trackLeft) ||
    !Number.isFinite(trackWidth) ||
    trackWidth <= 0
  )
    return 0;
  return Math.max(0, Math.min(1, (pointerX - trackLeft) / trackWidth));
};

export const getTimelineIndexAtPosition = (
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  timestepCount: number,
): number => {
  if (!Number.isSafeInteger(timestepCount) || timestepCount <= 1) return 0;
  const progress = getTimelineProgressAtPosition(
    clientX,
    trackLeft,
    trackWidth,
  );
  return Math.round(progress * (timestepCount - 1));
};

export const getTimelineTicks = (
  timestepCount: number,
  intervalSeconds: number,
  maxTicks = 13,
): TimelineTick[] => {
  if (!hasValidTimesteps(timestepCount, intervalSeconds)) return [];
  const lastIndex = Math.floor(timestepCount) - 1;
  if (lastIndex === 0) return [{ index: 0, elapsedSeconds: 0 }];

  const tickLimit = Number.isFinite(maxTicks)
    ? Math.max(2, Math.min(200, Math.floor(maxTicks)))
    : 13;
  const duration = lastIndex * intervalSeconds;
  if (!Number.isFinite(duration)) return [];
  const minimumTickInterval = duration / (tickLimit - 1);
  const tickInterval = niceTickInterval(minimumTickInterval);
  const indices = new Set([0]);

  for (let tick = 1; tick * tickInterval < duration; tick++) {
    indices.add(Math.round((tick * tickInterval) / intervalSeconds));
  }
  indices.add(lastIndex);

  return [...indices]
    .sort((left, right) => left - right)
    .map((index) => ({ index, elapsedSeconds: index * intervalSeconds }));
};

export const getTimelineDate = (
  startDate: Date,
  timestepIndex: number,
  intervalSeconds: number,
): Date => {
  if (
    !isValidDate(startDate) ||
    !Number.isFinite(timestepIndex) ||
    timestepIndex < 0 ||
    !Number.isFinite(intervalSeconds) ||
    intervalSeconds <= 0
  )
    return new Date(NaN);

  const elapsedMilliseconds = timestepIndex * intervalSeconds * 1000;
  if (!Number.isFinite(elapsedMilliseconds)) return new Date(NaN);
  return new Date(startDate.getTime() + Math.round(elapsedMilliseconds));
};

export const getTimestepForDate = (
  date: Date,
  startDate: Date,
  currentTimestepIndex: number,
  timestepCount: number,
  intervalSeconds: number,
): number | null => {
  if (
    !isValidDate(date) ||
    !isValidDate(startDate) ||
    !Number.isFinite(currentTimestepIndex) ||
    !hasValidTimesteps(timestepCount, intervalSeconds)
  )
    return null;

  const lastIndex = Math.floor(timestepCount) - 1;
  const intervalMilliseconds = intervalSeconds * 1000;
  if (!Number.isFinite(lastIndex * intervalMilliseconds)) return null;

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const firstIndexForDay = Math.max(
    0,
    ceilIndex(
      (dayStart.getTime() - startDate.getTime()) / intervalMilliseconds,
    ),
  );
  const lastIndexForDay = Math.min(
    lastIndex,
    ceilIndex((dayEnd.getTime() - startDate.getTime()) / intervalMilliseconds) -
      1,
  );
  if (
    !Number.isFinite(firstIndexForDay) ||
    !Number.isFinite(lastIndexForDay) ||
    firstIndexForDay > lastIndexForDay
  )
    return null;

  const currentIndex = Math.max(
    0,
    Math.min(lastIndex, Math.round(currentTimestepIndex)),
  );
  const currentDate = getTimelineDate(startDate, currentIndex, intervalSeconds);
  if (!isValidDate(currentDate)) return null;
  if (currentDate >= dayStart && currentDate < dayEnd) return currentIndex;

  const requestedDate = new Date(dayStart);
  requestedDate.setHours(
    currentDate.getHours(),
    currentDate.getMinutes(),
    currentDate.getSeconds(),
    currentDate.getMilliseconds(),
  );
  const requestedIndex = Math.round(
    (requestedDate.getTime() - startDate.getTime()) / intervalMilliseconds,
  );
  return Math.max(firstIndexForDay, Math.min(lastIndexForDay, requestedIndex));
};

export const getCalendarDays = (month: Date): Date[] => {
  if (!isValidDate(month)) return [];
  const firstDay = new Date(month);
  firstDay.setDate(1);
  firstDay.setHours(0, 0, 0, 0);
  const precedingDays = (firstDay.getDay() + 6) % 7;
  firstDay.setDate(firstDay.getDate() - precedingDays);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(date.getDate() + index);
    return date;
  });
};

export const formatTimelineTime = (elapsedSeconds: number): string => {
  const milliseconds =
    Number.isFinite(elapsedSeconds * 1000) && elapsedSeconds > 0
      ? Math.round(elapsedSeconds * 1000)
      : 0;
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const fraction = milliseconds % 1000;
  const hourAndMinute = [hours, minutes]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  if (seconds === 0 && fraction === 0) return hourAndMinute;

  const secondLabel = String(seconds).padStart(2, "0");
  const fractionalLabel = fraction
    ? `.${String(fraction).padStart(3, "0").replace(/0+$/, "")}`
    : "";
  return `${hourAndMinute}:${secondLabel}${fractionalLabel}`;
};

export const formatLocalDateTimeInput = (date: Date): string => {
  if (!isValidDate(date) || date.getFullYear() < 1) return "";
  const dateLabel = [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const timeLabel = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  const milliseconds = date.getMilliseconds();
  const fraction = milliseconds
    ? `.${String(milliseconds).padStart(3, "0")}`
    : "";
  return `${dateLabel}T${timeLabel}${fraction}`;
};

export const parseLocalDateTimeInput = (value: string): Date | null => {
  const match =
    /^(\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      value,
    );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"));
  if (year < 1) return null;

  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(hour, minute, second, millisecond);
  if (
    !isValidDate(date) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second ||
    date.getMilliseconds() !== millisecond
  )
    return null;
  return date;
};

const isValidDate = (date: Date) => Number.isFinite(date.getTime());

const hasValidTimesteps = (count: number, interval: number) =>
  Number.isFinite(count) &&
  count >= 1 &&
  Number.isFinite(interval) &&
  interval > 0;

const ceilIndex = (index: number) =>
  Math.ceil(index - 4 * Number.EPSILON * Math.max(1, Math.abs(index)));

const niceTickInterval = (minimum: number) => {
  const intervals = [
    1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 14400,
    21600, 43200, 86400, 172800, 604800, 1209600, 2592000, 7776000, 15552000,
    31536000,
  ];
  const interval = intervals.find((candidate) => candidate >= minimum);
  if (interval) return interval;
  return 31536000 * 10 ** Math.ceil(Math.log10(minimum / 31536000));
};
