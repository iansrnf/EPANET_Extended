import { AnyLayer, SymbolLayer } from "mapbox-gl";
import { DataSource } from "../data-source";

export const loggerPointLayers = ({
  sources,
}: {
  sources: DataSource[];
}): AnyLayer[] => {
  return [
    ...sources.map(
      (source) =>
        ({
          id: `${source}-logger-points-live-pressure`,
          type: "circle",
          source,
          filter: [
            "all",
            ["==", ["get", "type"], "loggerPoint"],
            ["==", ["get", "liveConnected"], true],
            ["has", "livePressurePsi"],
          ],
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              13,
              8,
              20,
              14,
            ],
            "circle-color": ["coalesce", ["get", "livePressureColor"], "#3b82f6"],
            "circle-opacity": 0.9,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
          },
        }) as AnyLayer,
    ),
    ...sources.map(
      (source) =>
        ({
          id: `${source}-logger-points`,
          type: "symbol",
          source,
          layout: {
            "symbol-placement": "point",
            "icon-image": [
              "case",
              ["==", ["get", "isActive"], false],
              "loggerPoint-disabled",
              "loggerPoint",
            ],
            "icon-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              13,
              0.2,
              20,
              0.45,
            ],
            "icon-allow-overlap": true,
          },
          filter: ["==", ["get", "type"], "loggerPoint"],
          paint: {
            "icon-opacity": [
              "case",
              ["!=", ["feature-state", "hidden"], true],
              1,
              0,
            ],
          },
        }) as SymbolLayer,
    ),
    ...sources.map(
      (source) =>
        ({
          id: `${source}-logger-points-live-pressure-label`,
          type: "symbol",
          source,
          layout: {
            "text-field": ["get", "livePressureLabel"],
            "text-size": 11,
            "text-anchor": "top-left",
            "text-offset": [0.95, 0.95],
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          filter: [
            "all",
            ["==", ["get", "type"], "loggerPoint"],
            ["has", "livePressureLabel"],
          ],
          paint: {
            "text-color": [
              "case",
              ["==", ["get", "liveConnected"], true],
              "#0f172a",
              "#6b7280",
            ],
            "text-halo-color": "#ffffff",
            "text-halo-width": 1,
            "text-halo-blur": 0.3,
          },
        }) as AnyLayer,
    ),
  ];
};
