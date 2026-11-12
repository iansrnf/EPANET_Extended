import { atom } from "jotai";
import type { LoggerConnection } from "@epanet-js/project-settings";

export type LoggerPreview =
  | { type: "draw"; coordinates: [number, number] }
  | {
      type: "connect";
      loggerId: string;
      connection: LoggerConnection | null;
    }
  | { type: "move"; loggerId: string; coordinates: [number, number] }
  | null;

export const loggerPreviewAtom = atom<LoggerPreview>(null);
