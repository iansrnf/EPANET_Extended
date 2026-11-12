import { atom } from "jotai";
import type { Logger, LoggerId } from "@epanet-js/project-settings";
import { projectSettingsAtom } from "./project-settings";

const noLoggers: Logger[] = [];

export const loggersAtom = atom(
  (get) => get(projectSettingsAtom).loggers ?? noLoggers,
);

export const selectedLoggerIdAtom = atom<LoggerId | null>(null);

export const selectedLoggerAtom = atom((get) => {
  const selectedId = get(selectedLoggerIdAtom);
  return get(loggersAtom).find((logger) => logger.id === selectedId);
});
