import { IconLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import {
  PressureLogger,
  PressureLoggers,
} from "src/hydraulic-model/pressure-loggers";
import { hexToArray } from "src/lib/color";
import { colors } from "src/lib/constants";
import type { LoggerTelemetryReading } from "src/state/logger-telemetry";

const haloFillColor = hexToArray(colors.orange500, 0.35) as [
  number,
  number,
  number,
  number,
];

const pressureLoggerIconSvg = ({
  stroke = colors.orange700,
  accent = colors.orange500,
  body = "#ffffff",
}: {
  stroke?: string;
  accent?: string;
  body?: string;
}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <path d="M12 4V2.5" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="7" y="4.5" width="10" height="15" rx="2.5" fill="${body}" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M10 9.5a2 2 0 1 1 4 0" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 9.5v2.5" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M9.5 15.5h5" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="16.5" cy="17" r="1.4" fill="${accent}"/>
</svg>
`;

const asDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const pressureLoggerIconUrl = asDataUrl(pressureLoggerIconSvg({}));

export type PressureLoggersLayer = IconLayer | ScatterplotLayer | TextLayer;
export type PressureLoggersOverlay = PressureLoggersLayer[];

export const shouldShowPressureLoggerOverlay = (zoom: number) => zoom >= 12;

export const updatePressureLoggersOverlayVisibility = (
  overlay: PressureLoggersOverlay,
  zoom: number,
) => {
  return overlay.map(
    (layer) =>
      layer.clone({
        visible: shouldShowPressureLoggerOverlay(zoom),
      }) as PressureLoggersLayer,
  );
};

export const buildPressureLoggersOverlay = (
  pressureLoggers: PressureLoggers,
  zoom: number,
  readingsByDeviceId: Record<string, LoggerTelemetryReading>,
): PressureLoggersOverlay => {
  const data = Array.from(pressureLoggers.values());
  const textData = data.filter((pressureLogger) =>
    Boolean(readingsByDeviceId[pressureLogger.label]),
  );

  return [
    new IconLayer({
      id: "pressure-loggers-layer",
      beforeId: "ephemeral-junction-highlight",
      data,
      getPosition: (d: PressureLogger) => d.coordinates as [number, number],
      getIcon: () => ({
        url: pressureLoggerIconUrl,
        width: 24,
        height: 24,
        anchorY: 12,
      }),
      getSize: 20,
      sizeUnits: "pixels",
      sizeMinPixels: 18,
      sizeMaxPixels: 24,
      billboard: true,
      visible: shouldShowPressureLoggerOverlay(zoom),
      pickable: true,
    }),
    new TextLayer({
      id: "pressure-loggers-value-layer",
      beforeId: "ephemeral-junction-highlight",
      data: textData,
      getPosition: (d: PressureLogger) => d.coordinates as [number, number],
      getText: (d: PressureLogger) => {
        const reading = readingsByDeviceId[d.label];
        return reading ? `${reading.psi.toFixed(2)} psi` : "";
      },
      getColor: hexToArray(colors.orange800),
      getSize: 12,
      sizeUnits: "pixels",
      sizeMinPixels: 10,
      sizeMaxPixels: 14,
      getPixelOffset: [0, -22],
      getTextAnchor: "middle",
      getAlignmentBaseline: "bottom",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontWeight: 700,
      background: true,
      getBackgroundColor: [255, 255, 255, 230],
      getBorderColor: hexToArray(colors.amber300),
      getBorderWidth: 1,
      visible: shouldShowPressureLoggerOverlay(zoom),
      pickable: false,
    }),
  ];
};

export const buildPressureLoggersSelectionOverlay = (
  pressureLoggers: PressureLogger[],
  zoom: number,
): PressureLoggersOverlay => {
  if (pressureLoggers.length === 0) return [];

  return [
    new ScatterplotLayer({
      id: "pressure-loggers-selection-halo-layer",
      beforeId: "ephemeral-junction-highlight",
      data: pressureLoggers,
      getPosition: (d: PressureLogger) => d.coordinates as [number, number],
      radiusUnits: "meters",
      getRadius: 3,
      radiusMinPixels: 8,
      radiusMaxPixels: 12,
      getFillColor: haloFillColor,
      antialiasing: true,
      visible: shouldShowPressureLoggerOverlay(zoom),
    }),
  ];
};
