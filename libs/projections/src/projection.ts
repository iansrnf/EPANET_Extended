import { Position } from "geojson";

export type CanonicalProjection = { type: "wgs84"; id: string; name: string };

export type XYGridProjection = {
  type: "xy-grid";
  id: string;
  name: string;
  centroid: Position;
  scale?: number;
};

export type Proj4Projection = {
  type: "proj4";
  id: string;
  name: string;
  code: string;
  deprecated?: boolean;
};

export type Projection =
  CanonicalProjection | XYGridProjection | Proj4Projection;

export const WGS84: CanonicalProjection = {
  type: "wgs84",
  id: "wgs84",
  name: "WGS 84",
};

export const WGS84_UTM_51N: Proj4Projection = {
  type: "proj4",
  id: "EPSG:32651",
  name: "WGS 84 / UTM zone 51N",
  code: "+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs",
};

export const WEB_MERCATOR: Proj4Projection = {
  type: "proj4",
  id: "EPSG:3857",
  name: "WGS 84 / Pseudo-Mercator",
  code: "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs",
};
