import { Position } from "geojson";
import { Projection, ProjectionConfig, WGS84, XY_GRID } from "./projection";
import {
  createProjectionTransformer,
  createInverseProjectionTransformer,
} from "src/lib/geojson-utils/coordinate-transform";
import {
  transformPoint,
  inverseTransformPoint,
  computeCentroid,
} from "./xy-grid-transform";

export type ProjectionMapper = {
  projection: Projection;
  toWgs84: (sourcePoint: Position) => Position;
  toSource: (wgs84Point: Position) => Position;
  backdropUnits: "NONE" | "DEGREES";
};

const identity = (p: Position): Position => p;

export const createProjectionMapper = (
  config: Projection | ProjectionConfig,
): ProjectionMapper => {
  switch (config.type) {
    case "wgs84":
      return {
        projection: WGS84,
        toWgs84: identity,
        toSource: identity,
        backdropUnits: "DEGREES",
      };
    case "xy-grid":
      return {
        projection: {
          ...XY_GRID,
          centroid: config.centroid,
          ...(config.scale !== undefined && { scale: config.scale }),
        },
        toWgs84: (p) => transformPoint(p, config.centroid, config.scale),
        toSource: (p) =>
          inverseTransformPoint(p, config.centroid, config.scale),
        backdropUnits: "NONE",
      };
    case "proj4": {
      const forward = createProjectionTransformer(config.code);
      const inverse = createInverseProjectionTransformer(config.code);
      return {
        projection: {
          type: "proj4",
          id: config.id,
          name: config.name,
          code: config.code,
        },
        toWgs84: (p) => forward(p as [number, number]),
        toSource: (p) => inverse(p as [number, number]),
        backdropUnits: "NONE",
      };
    }
  }
};

export const buildProjectionConfig = (
  projection: Projection,
  allPoints: () => Position[],
): ProjectionConfig => {
  switch (projection.type) {
    case "wgs84":
      return { type: "wgs84" };
    case "xy-grid":
      return {
        type: "xy-grid",
        centroid: computeCentroid(allPoints()),
        ...(projection.scale !== undefined && { scale: projection.scale }),
      };
    case "proj4":
      return {
        type: "proj4",
        id: projection.id,
        name: projection.name,
        code: projection.code,
      };
  }
};

export const getBackdropUnits = (
  config: ProjectionConfig,
): "NONE" | "DEGREES" => (config.type === "wgs84" ? "DEGREES" : "NONE");
