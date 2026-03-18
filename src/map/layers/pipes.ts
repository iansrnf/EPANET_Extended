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

export const pipeFlowPulseLayer = ({
  source,
  layerId,
}: {
  source: DataSource;
  layerId: LayerId;
}): LineLayer => {
  return {
    id: layerId,
    type: "line",
    source,
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    filter: [
      "all",
      ["==", ["get", "type"], "pipe"],
      ["==", ["get", "hasFlowPulse"], true],
    ],
    paint: {
      "line-opacity": [
        "case",
        ["boolean", ["feature-state", "hidden"], false],
        0,
        [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "pulseStrength"], 0],
          0,
          0.8,
          1,
          0.95,
        ],
      ],
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 3.5, 16, 10],
      "line-blur": ["interpolate", ["linear"], ["zoom"], 12, 0.75, 16, 1.75],
      "line-gradient": buildPipeFlowPulseGradientExpression(0),
    } as LinePaint,
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
      "symbol-placement": "line-center",
      "icon-image": "triangle",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.2, 26, 0.5],
      "icon-rotate": ["get", "rotation"],
      "icon-ignore-placement": true,
      "icon-allow-overlap": true,
      visibility: "none",
    },
    filter: ["all", ["==", "$type", "LineString"], ["==", "hasArrow", true]],
    paint: {
      "icon-color": ["coalesce", ["get", "color"], symbology.defaultColor],
      "icon-opacity": [
        ...zoomExpression(
          [14, 15, 16, 17, 18, 19, 20],
          [200, 100, 50, 20, 10, 5, 0],
        ),
      ],
    },
    minzoom: 14,
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

const zoomExpression = (
  steps: number[],
  lengths: number[],
): mapboxgl.Expression => {
  const result: mapboxgl.Expression = ["interpolate", ["linear"], ["zoom"]];

  for (const step of steps) {
    const index = steps.indexOf(step);
    const length = lengths[index];
    result.push(step, [
      "case",
      [
        "all",
        [">", ["get", "length"], length],
        ["!", ["boolean", ["feature-state", "hidden"], false]],
        ["!=", ["get", "isActive"], false],
      ],
      1,
      ["==", ["get", "isActive"], false],
      0.33,
      0,
    ]);
  }
  return result;
};

export const buildPipeFlowPulseGradientExpression = (
  phase: number,
): mapboxgl.Expression => {
  const stops = buildPulseStops(phase).flatMap(([stop, alpha]) => [
    stop,
    alpha === 0
      ? "rgba(255,255,255,0)"
      : alpha < 0.4
        ? "rgba(125,211,252,0.55)"
        : alpha < 0.85
          ? "rgba(255,255,255,0.9)"
          : "rgba(255,255,255,1)",
  ]);

  return [
    "let",
    "progress",
    [
      "case",
      ["<", ["coalesce", ["get", "flowDirection"], 1], 0],
      ["-", 1, ["line-progress"]],
      ["line-progress"],
    ],
    ["interpolate", ["linear"], ["var", "progress"], ...stops],
  ] as mapboxgl.Expression;
};

const buildPulseStops = (phase: number): Array<[number, number]> => {
  const pulseSpacing = 0.22;
  const outerWidth = 0.07;
  const innerWidth = 0.025;
  const stopMap = new Map<number, number>([
    [0, 0],
    [1, 0],
  ]);

  for (let center = phase - 1; center <= phase + 1; center += pulseSpacing) {
    const points: Array<[number, number]> = [
      [center - outerWidth, 0],
      [center - innerWidth, 0.35],
      [center, 1],
      [center + innerWidth, 0.35],
      [center + outerWidth, 0],
    ];

    for (const [position, alpha] of points) {
      if (position < 0 || position > 1) continue;
      const rounded = Number(position.toFixed(6));
      stopMap.set(rounded, Math.max(stopMap.get(rounded) ?? 0, alpha));
    }
  }

  return [...stopMap.entries()].sort((a, b) => a[0] - b[0]);
};
