import type { CircleLayer, Expression, LineLayer } from "mapbox-gl";
import { LAYER_MAX_ZOOM } from "@epanet-js/map";
import type { DataSource } from "../data-source";
import { assetFeedbackStrokes } from "../feedback-style";
import { defaultNodeSizeConfig, type NodeSizeConfig } from "../symbology";
import { junctionLayerMinZoom } from "./junctions";

type FeedbackLayerOptions = {
  source: DataSource;
  idPrefix: string;
  selectedOnly?: boolean;
};

export const junctionFeedbackRadius = ({
  minVisibleZoom,
  minSize,
  maxSize,
}: NodeSizeConfig): number | Expression => {
  if (minSize === maxSize) return minSize + 4;
  if (minVisibleZoom >= LAYER_MAX_ZOOM) return maxSize + 4;

  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    minVisibleZoom,
    minSize + 4,
    LAYER_MAX_ZOOM,
    maxSize + 4,
  ];
};

export const linkFeedbackLayers = ({
  source,
  idPrefix,
  selectedOnly = false,
}: FeedbackLayerOptions): LineLayer[] =>
  assetFeedbackStrokes.map(({ suffix, color, width, opacity }): LineLayer => ({
    id: `${idPrefix}-${suffix}`,
    type: "line",
    source,
    filter: selectedOnly
      ? ["all", ["==", "$type", "LineString"], ["==", "selected", true]]
      : ["==", "$type", "LineString"],
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": color,
      "line-width": width,
      "line-gap-width": ["interpolate", ["linear"], ["zoom"], 12, 4.5, 16, 8],
      "line-opacity": visibilityOpacity(opacity),
    },
  }));

export const junctionFeedbackLayers = ({
  source,
  idPrefix,
  selectedOnly = false,
}: FeedbackLayerOptions): CircleLayer[] =>
  assetFeedbackStrokes.map(
    ({ suffix, color, width, opacity }): CircleLayer => ({
      id: `${idPrefix}-${suffix}`,
      type: "circle",
      source,
      filter: selectedOnly
        ? [
            "all",
            ["==", "$type", "Point"],
            ["==", "type", "junction"],
            ["==", "selected", true],
          ]
        : ["all", ["==", "$type", "Point"], ["==", "type", "junction"]],
      paint: {
        "circle-radius": junctionFeedbackRadius(defaultNodeSizeConfig),
        "circle-opacity": 0,
        "circle-stroke-color": color,
        "circle-stroke-width": width,
        "circle-stroke-opacity": visibilityOpacity(opacity),
      },
      minzoom: junctionLayerMinZoom(defaultNodeSizeConfig),
    }),
  );

export const iconFeedbackLayers = ({
  source,
  idPrefix,
  selectedOnly = false,
}: FeedbackLayerOptions): CircleLayer[] =>
  assetFeedbackStrokes.map(
    ({ suffix, color, width, opacity }): CircleLayer => ({
      id: `${idPrefix}-${suffix}`,
      type: "circle",
      source,
      filter: selectedOnly
        ? [
            "all",
            ["==", "$type", "Point"],
            ["in", "type", "tank", "reservoir", "pump", "valve"],
            ["==", "selected", true],
          ]
        : [
            "all",
            ["==", "$type", "Point"],
            ["in", "type", "tank", "reservoir", "pump", "valve"],
          ],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 15, 20, 24],
        "circle-opacity": 0,
        "circle-stroke-color": color,
        "circle-stroke-width": width,
        "circle-stroke-opacity": visibilityOpacity(opacity),
      },
    }),
  );

const visibilityOpacity = (opacity: number): Expression => [
  "case",
  ["boolean", ["feature-state", "hidden"], false],
  0,
  opacity,
];
