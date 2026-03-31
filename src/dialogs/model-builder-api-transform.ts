import distance from "@turf/distance";
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Position,
} from "geojson";
import type { PipeStatus } from "src/hydraulic-model/asset-types/pipe";

export type LengthMode = "geometry" | "attribute" | "constant";

export type PipeAttributeMapping = {
  labelField: string | null;
  diameterField: string | null;
  defaultDiameter: number;
  roughnessField: string | null;
  defaultRoughness: number;
  minorLossField: string | null;
  defaultMinorLoss: number;
  statusField: string | null;
  defaultStatus: PipeStatus;
  lengthMode: LengthMode;
  lengthField: string | null;
  defaultLength: number;
};

export type JunctionAttributeMapping = {
  labelField: string | null;
  elevationField: string | null;
  defaultElevation: number;
  emitterCoefficientField: string | null;
  defaultEmitterCoefficient: number;
};

export type ApiNetworkMapping = {
  pipe: PipeAttributeMapping;
  junction: JunctionAttributeMapping;
};

export type PipePreviewRow = {
  id: string;
  label: string;
  coordinates: Position[];
  startJunctionId: string;
  startJunctionLabel: string;
  endJunctionId: string;
  endJunctionLabel: string;
  diameter: number;
  roughness: number;
  minorLoss: number;
  initialStatus: PipeStatus;
  length: number;
};

export type JunctionPreviewRow = {
  id: string;
  label: string;
  coordinates: Position;
  elevation: number;
  emitterCoefficient: number;
};

export type ApiNetworkPreview = {
  pipes: PipePreviewRow[];
  junctions: JunctionPreviewRow[];
  skippedFeatures: number;
};

export function collectPropertyNames(geoJson: FeatureCollection): string[] {
  const names = new Set<string>();

  for (const feature of geoJson.features) {
    if (!feature?.properties) continue;
    for (const key of Object.keys(feature.properties)) {
      names.add(key);
    }
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function buildApiNetworkPreview(
  geoJson: FeatureCollection,
  mapping: ApiNetworkMapping,
): ApiNetworkPreview {
  const junctionsByCoordinate = new Map<string, JunctionPreviewRow>();
  const pipes: PipePreviewRow[] = [];
  let skippedFeatures = 0;

  geoJson.features.forEach((feature, index) => {
    const coordinates = getLinearCoordinates(feature);
    if (coordinates.length < 2) {
      skippedFeatures += 1;
      return;
    }

    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    const startJunction = getOrCreateJunction(
      junctionsByCoordinate,
      start,
      feature,
      mapping.junction,
    );
    const endJunction = getOrCreateJunction(
      junctionsByCoordinate,
      end,
      feature,
      mapping.junction,
    );

    const pipeLabel =
      getStringProperty(feature.properties, mapping.pipe.labelField) ??
      String(feature.id ?? `P${index + 1}`);

    pipes.push({
      id: String(feature.id ?? `pipe-${index + 1}`),
      label: pipeLabel,
      coordinates,
      startJunctionId: startJunction.id,
      startJunctionLabel: startJunction.label,
      endJunctionId: endJunction.id,
      endJunctionLabel: endJunction.label,
      diameter: getNumericValue(
        feature.properties,
        mapping.pipe.diameterField,
        mapping.pipe.defaultDiameter,
      ),
      roughness: getNumericValue(
        feature.properties,
        mapping.pipe.roughnessField,
        mapping.pipe.defaultRoughness,
      ),
      minorLoss: getNumericValue(
        feature.properties,
        mapping.pipe.minorLossField,
        mapping.pipe.defaultMinorLoss,
      ),
      initialStatus: getPipeStatusValue(
        feature.properties,
        mapping.pipe.statusField,
        mapping.pipe.defaultStatus,
      ),
      length: getPipeLength(feature, coordinates, mapping.pipe),
    });
  });

  return {
    pipes,
    junctions: Array.from(junctionsByCoordinate.values()),
    skippedFeatures,
  };
}

function getOrCreateJunction(
  junctionsByCoordinate: Map<string, JunctionPreviewRow>,
  coordinates: Position,
  feature: Feature,
  mapping: JunctionAttributeMapping,
): JunctionPreviewRow {
  const key = toCoordinateKey(coordinates);
  const existing = junctionsByCoordinate.get(key);
  if (existing) return existing;

  const nextIndex = junctionsByCoordinate.size + 1;
  const junction: JunctionPreviewRow = {
    id: `junction-${nextIndex}`,
    label:
      getStringProperty(feature.properties, mapping.labelField) ??
      `J${nextIndex}`,
    coordinates,
    elevation: getNumericValue(
      feature.properties,
      mapping.elevationField,
      mapping.defaultElevation,
    ),
    emitterCoefficient: getNumericValue(
      feature.properties,
      mapping.emitterCoefficientField,
      mapping.defaultEmitterCoefficient,
    ),
  };

  junctionsByCoordinate.set(key, junction);
  return junction;
}

function getPipeLength(
  feature: Feature,
  coordinates: Position[],
  mapping: PipeAttributeMapping,
): number {
  if (mapping.lengthMode === "attribute") {
    return getNumericValue(
      feature.properties,
      mapping.lengthField,
      mapping.defaultLength,
    );
  }

  if (mapping.lengthMode === "constant") {
    return mapping.defaultLength;
  }

  let meters = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    meters += distance(coordinates[index - 1], coordinates[index]) * 1000;
  }
  return Number.isFinite(meters) ? meters : mapping.defaultLength;
}

function getPipeStatusValue(
  properties: GeoJsonProperties,
  field: string | null,
  fallback: PipeStatus,
): PipeStatus {
  const value = getStringProperty(properties, field)?.toLowerCase();
  if (value === "open" || value === "closed" || value === "cv") {
    return value;
  }
  return fallback;
}

function getNumericValue(
  properties: GeoJsonProperties,
  field: string | null,
  fallback: number,
): number {
  if (!field) return fallback;
  const rawValue = properties?.[field];
  if (typeof rawValue === "number" && Number.isFinite(rawValue))
    return rawValue;
  if (typeof rawValue === "string") {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getStringProperty(
  properties: GeoJsonProperties,
  field: string | null,
): string | null {
  if (!field) return null;
  const rawValue = properties?.[field];
  if (typeof rawValue === "string" && rawValue.trim()) return rawValue.trim();
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return String(rawValue);
  }
  return null;
}

function getLinearCoordinates(feature: Feature): Position[] {
  const geometry = feature.geometry;
  if (!geometry) return [];

  if (geometry.type === "LineString") {
    return geometry.coordinates.filter(isPosition);
  }

  if (geometry.type === "MultiLineString") {
    const merged: Position[] = [];

    for (const line of geometry.coordinates) {
      for (const position of line) {
        if (!isPosition(position)) continue;
        const previous = merged[merged.length - 1];
        if (
          !previous ||
          toCoordinateKey(previous) !== toCoordinateKey(position)
        ) {
          merged.push(position);
        }
      }
    }

    return merged;
  }

  return [];
}

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function toCoordinateKey([x, y]: Position): string {
  return `${x.toFixed(6)}:${y.toFixed(6)}`;
}
