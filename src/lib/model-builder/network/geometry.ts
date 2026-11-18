import type { Position } from "geojson";

export type XY = [number, number];

export type MetricProjection = {
  project: (position: Position) => XY;
  unproject: (point: XY) => Position;
};

export const createMetricProjection = (latitude: number): MetricProjection => {
  const latitudeScale = (6371008.8 * Math.PI) / 180;
  const longitudeScale =
    latitudeScale * Math.max(0.000001, Math.cos((latitude * Math.PI) / 180));
  return {
    project: (position) => [
      position[0] * longitudeScale,
      position[1] * latitudeScale,
    ],
    unproject: (point) => [point[0] / longitudeScale, point[1] / latitudeScale],
  };
};

export const isGeographicPosition = (position: Position): boolean =>
  Array.isArray(position) &&
  position.length >= 2 &&
  Number.isFinite(position[0]) &&
  Number.isFinite(position[1]) &&
  Math.abs(position[0]) <= 180 &&
  Math.abs(position[1]) <= 90;

export const squaredDistance = (a: XY, b: XY): number =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

export const projectOnSegment = (
  point: XY,
  a: XY,
  b: XY,
): { t: number; point: XY; distance: number } => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const squaredLength = dx * dx + dy * dy;
  const t =
    squaredLength === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / squaredLength,
          ),
        );
  const projected: XY = [a[0] + t * dx, a[1] + t * dy];
  return {
    t,
    point: projected,
    distance: Math.sqrt(squaredDistance(point, projected)),
  };
};

export const segmentIntersection = (a: XY, b: XY, c: XY, d: XY): XY | null => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const ex = d[0] - c[0];
  const ey = d[1] - c[1];
  const cross = dx * ey - dy * ex;
  if (Math.abs(cross) < 1e-12) return null;
  const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / cross;
  const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / cross;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + t * dx, a[1] + t * dy];
};

export const geographicLength = (coordinates: Position[]): number => {
  let meters = 0;
  for (let index = 1; index < coordinates.length; index++) {
    const a = coordinates[index - 1];
    const b = coordinates[index];
    const latA = (a[1] * Math.PI) / 180;
    const latB = (b[1] * Math.PI) / 180;
    const dLat = latB - latA;
    const dLon = ((b[0] - a[0]) * Math.PI) / 180;
    const haversine =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;
    meters += 12742017.6 * Math.asin(Math.sqrt(Math.min(1, haversine)));
  }
  return meters;
};

export const interpolatePosition = (
  a: Position,
  b: Position,
  t: number,
): Position => {
  const position: Position = [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  if (Number.isFinite(a[2]) && Number.isFinite(b[2]))
    position.push(a[2] + (b[2] - a[2]) * t);
  return position;
};

export const pathPoint = (
  coordinates: Position[],
  distance: number,
): { position: Position; index: number } => {
  let remaining = distance;
  for (let index = 1; index < coordinates.length; index++) {
    const length = geographicLength([
      coordinates[index - 1],
      coordinates[index],
    ]);
    if (remaining <= length || index === coordinates.length - 1) {
      return {
        position: interpolatePosition(
          coordinates[index - 1],
          coordinates[index],
          length === 0 ? 0 : Math.min(1, remaining / length),
        ),
        index,
      };
    }
    remaining -= length;
  }
  return { position: coordinates[0], index: 0 };
};
