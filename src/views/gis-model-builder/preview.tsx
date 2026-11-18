import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { Feature, Geometry, Position } from "geojson";
import { Button } from "src/components/elements";
import {
  featuresForLayer,
  roleColors,
  roleNames,
  type BuilderLayer,
  type BuilderSource,
} from "./data";
import type { NetworkLayerRole } from "src/lib/model-builder/network";
import { BasemapPreview } from "./basemap-preview";

type PreviewFeature = {
  feature: Feature;
  role?: NetworkLayerRole;
  name: string;
};

export const GeometryPreview = ({
  sources,
  layers,
  selectedSourceId,
  selectedLayerId,
}: {
  sources: BuilderSource[];
  layers: BuilderLayer[];
  selectedSourceId?: string;
  selectedLayerId?: string;
}) => {
  const gridId = useId();
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showBasemap, setShowBasemap] = useState(
    !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  );
  const handleBasemapUnavailable = useCallback(() => setShowBasemap(false), []);
  const drag = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const items = useMemo((): PreviewFeature[] => {
    if (selectedLayerId) {
      const layer = layers.find(({ id }) => id === selectedLayerId);
      if (
        layer &&
        sources.find(({ id }) => id === layer.sourceId)?.status === "ready"
      )
        return featuresForLayer(layer).map((feature) => ({
          feature,
          role: layer.role,
          name: layer.name,
        }));
    }
    if (selectedSourceId) {
      const source = sources.find(({ id }) => id === selectedSourceId);
      if (source?.status === "ready")
        return source.features.map((feature) => ({
          feature,
          name: source.name,
        }));
      return [];
    }
    if (layers.some(({ enabled }) => enabled)) {
      return layers
        .filter(
          ({ enabled, sourceId }) =>
            enabled &&
            sources.find(({ id }) => id === sourceId)?.status === "ready",
        )
        .flatMap((layer) =>
          featuresForLayer(layer).map((feature) => ({
            feature,
            role: layer.role,
            name: layer.name,
          })),
        );
    }
    return sources
      .filter(({ status }) => status === "ready")
      .flatMap(({ features, name }) =>
        features.map((feature) => ({ feature, name })),
      );
  }, [sources, layers, selectedLayerId, selectedSourceId]);
  const preview = useMemo(() => {
    const drawn = items.slice(0, 5000);
    const positions = drawn.flatMap(({ feature }) =>
      coordinatesOf(feature.geometry),
    );
    const finite = positions.filter(
      ([x, y]) => Number.isFinite(x) && Number.isFinite(y),
    );
    if (finite.length === 0) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of finite) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const aspect = Math.max(
      0.01,
      Math.cos((((minY + maxY) / 2) * Math.PI) / 180),
    );
    const width = Math.max((maxX - minX) * aspect, 0.00001);
    const height = Math.max(maxY - minY, 0.00001);
    const scale = Math.min(880 / width, 520 / height);
    const project = ([x, y]: Position) => [
      480 + (x - (minX + maxX) / 2) * aspect * scale,
      300 - (y - (minY + maxY) / 2) * scale,
    ];
    return { drawn, project, bounds: [minX, minY, maxX, maxY] };
  }, [items]);
  const view = {
    x: 480 - 480 / zoom + offset.x,
    y: 300 - 300 / zoom + offset.y,
    width: 960 / zoom,
    height: 600 / zoom,
  };

  return (
    <div className="relative flex min-h-64 flex-1 flex-col overflow-hidden bg-panel">
      {preview && showBasemap ? (
        <>
          <div className="min-h-96 flex-1" />
          <BasemapPreview
            items={items}
            onUnavailable={handleBasemapUnavailable}
          />
        </>
      ) : preview ? (
        <svg
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          className="min-h-64 w-full flex-1 cursor-grab touch-none active:cursor-grabbing"
          role="img"
          aria-label={`Geographic preview of ${items.length.toLocaleString()} GIS records. Use the zoom and fit controls to inspect the network.`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              offsetX: offset.x,
              offsetY: offset.y,
            };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setOffset({
              x:
                drag.current.offsetX -
                ((event.clientX - drag.current.x) / rect.width) * view.width,
              y:
                drag.current.offsetY -
                ((event.clientY - drag.current.y) / rect.height) * view.height,
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <defs>
            <pattern
              id={gridId}
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-subtle"
                opacity="0.18"
              />
            </pattern>
          </defs>
          <rect
            x={view.x}
            y={view.y}
            width={view.width}
            height={view.height}
            fill={`url(#${gridId})`}
          />
          {preview.drawn.map(({ feature, role, name }, index) => (
            <g key={index} className={role ? roleColors[role] : "text-accent"}>
              <title>{`${name}: ${String(feature.properties?.label ?? feature.properties?.name ?? feature.properties?.id ?? index + 1)}`}</title>
              {pathsOf(feature.geometry, preview.project).map(
                ({ path, point, polygon }, part) =>
                  point ? (
                    <circle
                      key={part}
                      cx={point[0]}
                      cy={point[1]}
                      r={3.5 / Math.sqrt(zoom)}
                      fill="currentColor"
                      stroke="var(--color-background-base)"
                      strokeWidth={0.7 / zoom}
                    />
                  ) : (
                    <path
                      key={part}
                      d={path}
                      fill={polygon ? "currentColor" : "none"}
                      fillOpacity={polygon ? 0.12 : 0}
                      stroke="currentColor"
                      strokeWidth={1.7 / Math.sqrt(zoom)}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ),
              )}
            </g>
          ))}
        </svg>
      ) : (
        <div className="m-auto max-w-xs p-8 text-center text-subtle">
          <NetworkIllustration />
          <p className="mt-6 font-medium text-default">Your network preview</p>
          <p className="mt-2 text-sm">
            Add GIS files to explore their geometry and assign network elements.
          </p>
        </div>
      )}
      {preview && (
        <>
          <div className="absolute left-3 top-3 flex gap-1 rounded-sm border bg-base p-1 shadow-sm">
            {!showBasemap && (
              <>
                <Button
                  size="sm"
                  aria-label="Zoom in preview"
                  onClick={() => setZoom((value) => Math.min(32, value * 1.4))}
                >
                  +
                </Button>
                <Button
                  size="sm"
                  aria-label="Zoom out preview"
                  onClick={() => setZoom((value) => Math.max(0.5, value / 1.4))}
                >
                  −
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setZoom(1);
                    setOffset({ x: 0, y: 0 });
                  }}
                >
                  Fit
                </Button>
              </>
            )}
            {!!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
              <Button
                size="sm"
                onClick={() => setShowBasemap((value) => !value)}
              >
                {showBasemap ? "Geometry" : "Basemap"}
              </Button>
            )}
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-3 rounded-sm border bg-base px-3 py-2 text-xs shadow-sm">
            <span>
              {Math.min(
                items.length,
                showBasemap ? 50000 : 5000,
              ).toLocaleString()}{" "}
              of {items.length.toLocaleString()} records shown
            </span>
            {[
              ...new Set(
                preview.drawn.flatMap(({ role }) => (role ? [role] : [])),
              ),
            ].map((role) => (
              <span
                key={role}
                className={`flex items-center gap-1 ${roleColors[role]}`}
              >
                <span aria-hidden="true">●</span>
                {roleNames[role]}
              </span>
            ))}
            <span className="ml-auto text-subtle">
              {showBasemap ? "Map preview" : "Geometry preview"} · WGS84
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export const NetworkIllustration = () => (
  <svg
    viewBox="0 0 320 180"
    className="mx-auto w-full max-w-sm text-accent"
    aria-hidden="true"
  >
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M35 45 123 30 180 57 265 40 280 120 220 150 110 150 55 105 35 45M55 105 150 95 123 30M150 95 180 57M150 95 220 150M150 95 280 120M110 150 150 95" />
      {[
        [35, 45],
        [123, 30],
        [180, 57],
        [265, 40],
        [280, 120],
        [220, 150],
        [110, 150],
        [55, 105],
        [150, 95],
      ].map(([x, y], index) => (
        <circle
          key={index}
          cx={x}
          cy={y}
          r="5"
          fill="var(--color-background-base)"
        />
      ))}
      <rect x="25" y="35" width="20" height="20" fill="currentColor" />
      <rect
        x="270"
        y="110"
        width="20"
        height="20"
        rx="4"
        fill="var(--color-background-base)"
      />
    </g>
  </svg>
);

const coordinatesOf = (geometry: Geometry | null): Position[] => {
  if (!geometry) return [];
  if (geometry.type === "GeometryCollection")
    return geometry.geometries.flatMap(coordinatesOf);
  const positions: Position[] = [];
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number")
      positions.push(value as Position);
    else value.forEach(visit);
  };
  visit(geometry.coordinates);
  return positions;
};

const pathsOf = (
  geometry: Geometry | null,
  project: (position: Position) => number[],
): { path?: string; point?: number[]; polygon?: boolean }[] => {
  if (!geometry) return [];
  if (geometry.type === "GeometryCollection")
    return geometry.geometries.flatMap((part) => pathsOf(part, project));
  const line = (coordinates: Position[], close = false) =>
    coordinates
      .map(
        (position, index) =>
          `${index === 0 ? "M" : "L"}${project(position).join(" ")}`,
      )
      .join(" ") + (close ? " Z" : "");
  switch (geometry.type) {
    case "Point":
      return [{ point: project(geometry.coordinates) }];
    case "MultiPoint":
      return geometry.coordinates.map((position) => ({
        point: project(position),
      }));
    case "LineString":
      return [{ path: line(geometry.coordinates) }];
    case "MultiLineString":
      return geometry.coordinates.map((coordinates) => ({
        path: line(coordinates),
      }));
    case "Polygon":
      return [
        {
          path: geometry.coordinates
            .map((coordinates) => line(coordinates, true))
            .join(" "),
          polygon: true,
        },
      ];
    case "MultiPolygon":
      return geometry.coordinates.map((polygon) => ({
        path: polygon.map((coordinates) => line(coordinates, true)).join(" "),
        polygon: true,
      }));
  }
};
