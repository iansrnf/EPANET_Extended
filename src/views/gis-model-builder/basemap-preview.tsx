import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { NetworkLayerRole } from "src/lib/model-builder/network";
import { Button } from "src/components/elements";

type MapItem = { feature: Feature; role?: NetworkLayerRole; name: string };

export const BasemapPreview = ({
  items,
  onUnavailable,
}: {
  items: MapItem[];
  onUnavailable: () => void;
}) => {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const loaded = useRef(false);
  const data = useMemo(
    (): FeatureCollection => ({
      type: "FeatureCollection",
      features: items.slice(0, 50000).map(({ feature, role, name }, index) => ({
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          element: role ?? "source",
          title: `${name}: ${String(feature.properties?.label ?? feature.properties?.name ?? feature.properties?.id ?? index + 1)}`,
        },
      })),
    }),
    [items],
  );
  const latestData = useRef(data);
  latestData.current = data;

  useEffect(() => {
    if (!container.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || !mapboxgl.supported()) {
      onUnavailable();
      return;
    }
    let instance: mapboxgl.Map;
    try {
      instance = new mapboxgl.Map({
        container: container.current,
        accessToken: token,
        style: "mapbox://styles/mapbox/light-v11",
        center: [125, 6],
        zoom: 9,
        attributionControl: true,
        dragRotate: false,
      });
    } catch {
      onUnavailable();
      return;
    }
    map.current = instance;
    instance.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    instance.on("error", (event) => {
      const error = event.error as Error & { status?: number };
      if (!loaded.current || error.status === 401 || error.status === 403)
        onUnavailable();
    });
    instance.on("load", () => {
      loaded.current = true;
      instance.addSource("gis-build-preview", {
        type: "geojson",
        data: latestData.current,
      });
      const color: mapboxgl.Expression = [
        "match",
        ["get", "element"],
        "pipe",
        "#2563eb",
        "junction",
        "#16a34a",
        "reservoir",
        "#0891b2",
        "tank",
        "#9333ea",
        "pump",
        "#dc2626",
        "valve",
        "#ea580c",
        "customerPoint",
        "#db2777",
        "zone",
        "#0d9488",
        "#4f46e5",
      ];
      instance.addLayer({
        id: "gis-build-polygons",
        type: "fill",
        source: "gis-build-preview",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": color, "fill-opacity": 0.15 },
      });
      instance.addLayer({
        id: "gis-build-lines",
        type: "line",
        source: "gis-build-preview",
        filter: ["!=", ["geometry-type"], "Point"],
        paint: { "line-color": color, "line-width": 2 },
      });
      instance.addLayer({
        id: "gis-build-points",
        type: "circle",
        source: "gis-build-preview",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": color,
          "circle-radius": 4,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1,
        },
      });
      instance.on("click", "gis-build-points", (event) => {
        const feature = event.features?.[0];
        if (feature?.properties?.title)
          new mapboxgl.Popup()
            .setLngLat(event.lngLat)
            .setText(String(feature.properties.title))
            .addTo(instance);
      });
      fitToData(instance, latestData.current);
    });
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(container.current);
    return () => {
      resizeObserver.disconnect();
      loaded.current = false;
      map.current = null;
      instance.remove();
    };
  }, [onUnavailable]);

  useEffect(() => {
    if (!map.current || !loaded.current) return;
    (
      map.current.getSource("gis-build-preview") as
        mapboxgl.GeoJSONSource | undefined
    )?.setData(data);
    fitToData(map.current, data);
  }, [data]);

  return (
    <div
      className="absolute inset-x-0 top-0 bottom-14"
      aria-label="Geographic map preview"
    >
      <div ref={container} className="absolute inset-0" />
      <Button
        size="sm"
        className="absolute right-3 top-24 bg-base shadow-sm"
        onClick={() => {
          if (map.current) fitToData(map.current, data);
        }}
      >
        Fit network
      </Button>
    </div>
  );
};

const fitToData = (map: mapboxgl.Map, data: FeatureCollection) => {
  const bounds = new mapboxgl.LngLatBounds();
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      const position = value as Position;
      if (
        Number.isFinite(position[0]) &&
        Number.isFinite(position[1]) &&
        Math.abs(position[0]) <= 180 &&
        Math.abs(position[1]) <= 90
      )
        bounds.extend([position[0], position[1]]);
    } else value.forEach(visit);
  };
  const geometry = (item: Geometry | null): void => {
    if (!item) return;
    if (item.type === "GeometryCollection") item.geometries.forEach(geometry);
    else visit(item.coordinates);
  };
  data.features.forEach((feature) => geometry(feature.geometry));
  if (!bounds.isEmpty())
    map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 19 });
};
