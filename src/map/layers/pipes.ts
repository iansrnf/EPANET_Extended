import { LineLayer, LinePaint, SymbolLayer } from "mapbox-gl";
import { ISymbology } from "src/types";
import { asNumberExpression } from "src/lib/symbolization-deprecated";
import { DataSource } from "../data-source";
import { LayerId } from "./layer";
import { colors } from "src/lib/constants";

export const pipesLayer = ({
  source,
  layerId,
  symbology,
}: {
  source: DataSource;
  layerId: LayerId;
  symbology: ISymbology;
}): LineLayer => {
  const paint = {
    "line-opacity": [
      "case",
      ["boolean", ["feature-state", "hidden"], false],
      0,
      asNumberExpression({
        symbology,
        part: "stroke-opacity",
        defaultValue: 1,
      }),
    ],
    "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 16, 4],
    "line-color": [
      "case",
      ["==", ["get", "isActive"], false],
      colors.zinc400,
      ["coalesce", ["get", "color"], symbology.defaultColor],
    ],
    "line-dasharray": [
      "case",
      ["==", ["get", "status"], "closed"],
      ["literal", [2, 1]],
      ["literal", [1, 0]],
    ],
  };
  return {
    id: layerId,
    type: "line",
    source,
    filter: ["==", "type", "pipe"],
    paint: paint as LinePaint,
  };
};

export const pipeArrows = ({
  source,
  layerId,
  symbology,
}: {
  source: DataSource;
  layerId: LayerId;
  symbology: ISymbology;
}): SymbolLayer => {
  return {
    id: layerId,
    type: "symbol",
    source,
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 12, 220, 18, 90],
      "icon-image": "triangle",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.2, 26, 0.5],
      "icon-offset": [0, 0],
      "icon-rotate": ["get", "rotation"],
      "icon-rotation-alignment": "map",
      "icon-ignore-placement": true,
      "icon-allow-overlap": true,
      visibility: "none",
    },
    filter: ["all", ["==", "$type", "LineString"], ["==", "hasArrow", true]],
    paint: {
      "icon-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "flowMagnitude"], 0],
        0,
        colors.amber500,
        10,
        colors.orange500,
        30,
        colors.red600,
      ],
      "icon-opacity": [
        "case",
        ["boolean", ["feature-state", "hidden"], false],
        0,
        ["==", ["get", "isActive"], false],
        0.25,
        0.9,
      ],
    },
    minzoom: 12,
  };
};

export const checkValveIcons = ({
  source,
  layerId,
}: {
  source: DataSource;
  layerId: string;
}): SymbolLayer => {
  return {
    id: layerId,
    type: "symbol",
    source,
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.1, 20, 0.4],
      "icon-rotate": ["get", "rotation"],
      "icon-allow-overlap": true,
      "icon-rotation-alignment": "map",
    },
    filter: ["all", ["==", "type", "pipe"], ["has", "icon"]],
    paint: {
      "icon-opacity": [
        "case",
        ["boolean", ["feature-state", "hidden"], false],
        0,
        ["==", ["get", "isActive"], false],
        0.5,
        1,
      ],
    },
    minzoom: 13,
  };
};
