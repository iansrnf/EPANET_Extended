import type { Feature, Point } from "geojson";
import type { AnyLayer } from "mapbox-gl";
import type { DeviceLocation } from "src/state/device-location";

export const DEVICE_LOCATION_SOURCE_ID = "device-location";

export const buildDeviceLocationFeatures = (
  position: DeviceLocation | null,
): Feature<Point>[] => {
  if (!position) return [];

  return [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Point",
        coordinates: [position.longitude, position.latitude],
      },
    },
  ];
};

export const deviceLocationLayers: AnyLayer[] = [
  {
    id: "device-location-marker-halo",
    type: "circle",
    source: DEVICE_LOCATION_SOURCE_ID,
    filter: ["==", "$type", "Point"],
    paint: {
      "circle-radius": 13,
      "circle-color": "#2563eb",
      "circle-opacity": 0.15,
      "circle-pitch-alignment": "viewport",
    },
  },
  {
    id: "device-location-marker",
    type: "circle",
    source: DEVICE_LOCATION_SOURCE_ID,
    filter: ["==", "$type", "Point"],
    paint: {
      "circle-radius": 7,
      "circle-color": "#2563eb",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
      "circle-pitch-alignment": "viewport",
    },
  },
];
