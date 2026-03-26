import { Position } from "geojson";

export type Projection = {
  id: string;
  name: string;
  type?: "wgs84" | "xy-grid" | "proj4";
  code?: string;
  deprecated?: boolean;
};

export type CanonicalProjection = Projection & {
  type: "wgs84";
  id: "wgs84";
};

export type XYGridProjection = {
  type: "xy-grid";
  id: "xy-grid";
  name: string;
  centroid: Position;
};

export type Proj4Projection = Projection & {
  type: "proj4";
  code: string;
};

export const WGS84: CanonicalProjection = {
  type: "wgs84",
  id: "wgs84",
  name: "WGS 84",
};
export const XY_GRID: Projection = {
  type: "xy-grid",
  id: "xy-grid",
  name: "XY Grid",
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
