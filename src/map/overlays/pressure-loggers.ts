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
  stroke = colors.gray700,
  accent = colors.gray700,
  body = "#ffffff",
}: {
  stroke?: string;
  accent?: string;
  body?: string;
}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <rect x="5" y="3.5" width="16" height="17" rx="2.5" fill="${body}" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M3 9v6" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M3 12h2" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="10" y="7" width="6" height="4.5" rx="1" fill="${body}" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="8" cy="7.5" r="0.8" fill="${accent}"/>
  <circle cx="8" cy="10.5" r="0.8" fill="${accent}"/>
  <circle cx="9.5" cy="15.5" r="2.4" fill="${body}" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M7.6 15.5h3.8" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="15" cy="15.5" r="2.4" fill="${body}" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M13.4 13.9l3.2 3.2" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M18 6.5h1.5" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M18 9.5h1.5" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M18 12.5h1.5" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M18 15.5h1.5" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const asDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const pressureLoggerIconUrl = asDataUrl(pressureLoggerIconSvg({}));

export type PressureLoggersLayer = IconLayer | ScatterplotLayer | TextLayer;
export type PressureLoggersOverlay = PressureLoggersLayer[];

export const shouldShowPressureLoggerOverlay = (_zoom: number) => true;

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
  const textData = data.filter(
    (pressureLogger) =>
      typeof readingsByDeviceId[pressureLogger.label]?.psi === "number",
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
        return reading?.psi !== undefined
          ? `${reading.psi.toFixed(3)} psi`
          : "";
      },
      getColor: hexToArray(colors.red600),
      getSize: 12,
      sizeUnits: "pixels",
      sizeMinPixels: 10,
      sizeMaxPixels: 14,
      getPixelOffset: [14, 2],
      getTextAnchor: "start",
      getAlignmentBaseline: "center",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontWeight: 700,
      background: false,
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
