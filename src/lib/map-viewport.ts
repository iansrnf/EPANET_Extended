import type { InitialViewport } from "@epanet-js/map";
import type { Map as MapboxMap } from "mapbox-gl";

export const captureMapViewport = (
  map: Pick<MapboxMap, "getZoom" | "getPitch" | "getBearing"> & {
    getCenter: () => Pick<ReturnType<MapboxMap["getCenter"]>, "toArray">;
  },
  previous: InitialViewport,
): InitialViewport => {
  const coordinates = map.getCenter().toArray();
  const center: [number, number] = [coordinates[0], coordinates[1]];
  const zoom = map.getZoom();
  const pitch = map.getPitch();
  const bearing = map.getBearing();

  if (
    previous.center[0] === center[0] &&
    previous.center[1] === center[1] &&
    previous.zoom === zoom &&
    (previous.pitch ?? 0) === pitch &&
    (previous.bearing ?? 0) === bearing
  ) {
    return previous;
  }

  return { center, zoom, pitch, bearing };
};
