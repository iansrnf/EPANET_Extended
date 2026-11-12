import {
  IconLayer,
  LineLayer,
  ScatterplotLayer,
  TextLayer,
} from "@deck.gl/layers";
import { findNearestPointOnLine } from "@epanet-js/geometry";
import { lineString, point } from "@turf/helpers";
import type { Logger } from "@epanet-js/project-settings";
import type { AssetsMap, Pipe } from "src/hydraulic-model";
import type { LoggerPreview } from "src/state/logger-map";
import {
  formatLoggerPressure,
  type LoggerReading,
} from "src/lib/logger-stream";

export const LOGGER_LAYER_ID = "loggers-layer";
export const LOGGER_PRESSURE_LAYER_ID = "logger-pressure-layer";
const overlayPosition = { beforeId: "ephemeral-junction-highlight" };
const noReadings: ReadonlyMap<string, LoggerReading> = new Map();

const gaugeIcon = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#0f766e" stroke="white" stroke-width="2"/><path d="M8 20a9 9 0 1 1 16 0M16 16l5-5" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="16" r="2" fill="white"/></svg>',
)}`;

type LoggerMarker = Pick<Logger, "id" | "label" | "coordinates">;
type LoggerPressureLabel = Pick<LoggerMarker, "id" | "coordinates"> & {
  text: string;
};
type ConnectionLine = {
  source: [number, number];
  target: [number, number];
  preview: boolean;
};

export type LoggersOverlay = Array<
  IconLayer | LineLayer | ScatterplotLayer | TextLayer
>;

export const buildLoggersOverlay = (
  loggers: Logger[],
  assets: AssetsMap,
  selectedLoggerId: string | null,
  preview: LoggerPreview,
  readings: ReadonlyMap<string, LoggerReading> = noReadings,
  locale?: string,
): LoggersOverlay => {
  const markers: LoggerMarker[] = [];
  const pressureLabels: LoggerPressureLabel[] = [];
  const connectionLines: ConnectionLine[] = [];

  for (const logger of loggers) {
    const coordinates =
      preview?.type === "move" && preview.loggerId === logger.id
        ? preview.coordinates
        : logger.coordinates;

    markers.push({ id: logger.id, label: logger.label, coordinates });
    const reading = readings.get(logger.id);
    if (
      typeof reading?.pressure === "number" &&
      Number.isFinite(reading.pressure)
    ) {
      pressureLabels.push({
        id: logger.id,
        coordinates,
        text: `${formatLoggerPressure(reading.pressure, locale)} psi`,
      });
    }

    const connection =
      preview?.type === "connect" && preview.loggerId === logger.id
        ? preview.connection
        : logger.connection;
    const asset = connection ? assets.get(connection.assetId) : undefined;
    if (connection && asset && (asset.type === "pipe" || !asset.isLink)) {
      const target =
        asset.type === "pipe"
          ? (findNearestPointOnLine(
              lineString((asset as Pipe).coordinates),
              point(connection.snapPoint),
              { precision: 8 },
            ).coordinates as [number, number])
          : (asset.coordinates as [number, number]);
      connectionLines.push({
        source: coordinates,
        target,
        preview: preview?.type === "connect" && preview.loggerId === logger.id,
      });
    }
  }

  if (preview?.type === "draw") {
    markers.push({ id: "", label: "", coordinates: preview.coordinates });
  }

  return [
    new LineLayer<ConnectionLine>({
      ...overlayPosition,
      id: "logger-connections-layer",
      data: connectionLines,
      getSourcePosition: (line) => line.source,
      getTargetPosition: (line) => line.target,
      getColor: (line) => (line.preview ? [217, 70, 239] : [13, 148, 136]),
      getWidth: 2,
      widthUnits: "pixels",
    }),
    new ScatterplotLayer<LoggerMarker>({
      ...overlayPosition,
      id: "logger-selection-layer",
      data: markers.filter((logger) => logger.id === selectedLoggerId),
      getPosition: (logger) => logger.coordinates,
      radiusUnits: "pixels",
      getRadius: 15,
      getFillColor: [217, 70, 239, 85],
      stroked: true,
      getLineColor: [192, 38, 211],
      lineWidthUnits: "pixels",
      getLineWidth: 2,
    }),
    new IconLayer<LoggerMarker>({
      ...overlayPosition,
      id: LOGGER_LAYER_ID,
      data: markers,
      getPosition: (logger) => logger.coordinates,
      getIcon: () => ({ url: gaugeIcon, width: 32, height: 32 }),
      getSize: 26,
      sizeUnits: "pixels",
      pickable: true,
    }),
    new TextLayer<LoggerPressureLabel>({
      ...overlayPosition,
      id: LOGGER_PRESSURE_LAYER_ID,
      data: pressureLabels,
      getPosition: (label) => label.coordinates,
      getText: (label) => label.text,
      getColor: [15, 65, 60, 255],
      getSize: 13,
      sizeUnits: "pixels",
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 600,
      characterSet: "auto",
      getTextAnchor: "middle",
      getAlignmentBaseline: "bottom",
      getPixelOffset: [0, -20],
      background: true,
      getBackgroundColor: [255, 255, 255, 245],
      getBorderColor: [15, 118, 110, 60],
      getBorderWidth: 1,
      backgroundPadding: [6, 4],
      backgroundBorderRadius: 5,
      pickable: false,
    }),
  ];
};
