export type LoggerId = string;

export type LoggerConnection = {
  assetId: number;
  snapPoint: [number, number];
};

export type Logger = {
  id: LoggerId;
  label: string;
  coordinates: [number, number];
  connection: LoggerConnection | null;
};
