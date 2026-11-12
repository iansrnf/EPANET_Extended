import type { EPSResultsReader, TimeSeries } from "@epanet-js/simulation";

export type LoggerComparisonNodeType = "junction" | "tank" | "reservoir";

const seriesByReader = new WeakMap<
  EPSResultsReader,
  Map<string, Promise<TimeSeries | null>>
>();

export const readLoggerNodePressureSeries = (
  reader: EPSResultsReader,
  assetId: number,
  assetType: LoggerComparisonNodeType,
): Promise<TimeSeries | null> => {
  let seriesByNode = seriesByReader.get(reader);
  if (!seriesByNode) {
    seriesByNode = new Map();
    seriesByReader.set(reader, seriesByNode);
  }
  const key = `${assetType}:${assetId}`;
  const cached = seriesByNode.get(key);
  if (cached) return cached;

  const request = readPressureSeries(reader, assetId, assetType).then(
    (series) => {
      if (!series) seriesByNode.delete(key);
      return series;
    },
    (error: unknown) => {
      seriesByNode.delete(key);
      throw error;
    },
  );
  seriesByNode.set(key, request);
  return request;
};

const readPressureSeries = (
  reader: EPSResultsReader,
  assetId: number,
  assetType: LoggerComparisonNodeType,
) => {
  switch (assetType) {
    case "junction":
      return reader.getTimeSeries(assetId, "junction", "pressure");
    case "tank":
      return reader.getTimeSeries(assetId, "tank", "pressure");
    case "reservoir":
      return reader.getTimeSeries(assetId, "reservoir", "pressure");
  }
};
