export type {
  Projection,
  ProjectionConfig,
  CanonicalProjection,
  XYGridProjection,
  Proj4Projection,
} from "./projection";
export { WGS84, XY_GRID, projectionFromId } from "./projection";
export type { ProjectionMapper } from "./projection-mapper";
export {
  createProjectionMapper,
  buildProjectionConfig,
  getBackdropUnits,
} from "./projection-mapper";
export { inverseProjectGeoJson } from "./inverse-project-geojson";
