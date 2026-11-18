import type { MultiPolygon, Polygon, Position } from "geojson";
import polylabel from "polylabel";

export const getZonePanelAnchor = (
  geometry: Polygon | MultiPolygon,
): Position | undefined => {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let bestPoint: Position | undefined;
  let bestDistance = -Infinity;

  for (const polygon of polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 4) continue;
    const fallback = ring[0];
    if (!Number.isFinite(fallback[0]) || !Number.isFinite(fallback[1]))
      continue;
    const vertexCount = polygon.reduce(
      (total, boundary) => total + boundary.length,
      0,
    );
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const width = maxX - minX;
    const height = maxY - minY;
    const minDimension = Math.min(width, height);
    const maxDimension = Math.max(width, height);
    const withinBudget =
      Number.isFinite(maxDimension) &&
      minDimension > 0 &&
      vertexCount <= 5000 &&
      maxDimension / minDimension <= 100;
    const point = withinBudget ? polylabel(polygon, maxDimension / 1000) : null;
    const hasInterior =
      point !== null &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]) &&
      Number.isFinite(point.distance) &&
      point.distance >= 0;
    const distance = hasInterior ? point.distance : 0;
    if (distance > bestDistance) {
      bestPoint = hasInterior ? [point[0], point[1]] : fallback;
      bestDistance = distance;
    }
  }

  return bestPoint;
};
