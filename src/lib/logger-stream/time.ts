import { getLoggerTimestampMilliseconds } from "./history";
import { LOGGER_TIME_ZONE } from "./time-zone";

export {
  LOGGER_TIME_ZONE,
  LOGGER_TIME_ZONE_OFFSET_MILLISECONDS,
} from "./time-zone";

export const formatLoggerTimestamp = (
  timestamp: string,
  locale: string,
): string => {
  const milliseconds = getLoggerTimestampMilliseconds(timestamp);
  if (milliseconds === null) return timestamp;
  const formatted = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: /\.\d/.test(timestamp) ? 3 : undefined,
    hourCycle: "h23",
    timeZone: LOGGER_TIME_ZONE,
  }).format(milliseconds);
  return `${formatted} UTC+8`;
};
