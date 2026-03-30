import { Position } from "geojson";

export type CanonicalProjection = { type: "wgs84"; id: string; name: string };

export type XYGridProjection = {
  type: "xy-grid";
  id: string;
  name: string;
  centroid: Position;
};

export type Proj4Projection = {
  type: "proj4";
  id: string;
  name: string;
  code: string;
  deprecated?: boolean;
};

export type Projection =
  | CanonicalProjection
  | XYGridProjection
  | Proj4Projection;

export const WGS84: CanonicalProjection = {
  type: "wgs84",
  id: "wgs84",
  name: "WGS 84",
};
export const XY_GRID: XYGridProjection = {
  type: "xy-grid",
  id: "xy-grid",
  name: "XY Grid",
  centroid: [0, 0],
};

export const projectionFromId = (id: string): Projection => {
  if (id === "wgs84") return WGS84;
  if (id === "xy-grid") return XY_GRID;
  return { type: "proj4", id, name: id, code: id };
};

export type ProjectionConfig =
  | { type: "wgs84" }
  | { type: "xy-grid"; centroid: Position }
  | {
      type: "proj4";
      id: string;
      name: string;
      code: string;
    };
