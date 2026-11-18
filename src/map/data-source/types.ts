export type DataSource =
  | "main-features"
  | "delta-features"
  | "icons"
  | "delta-icons"
  | "ephemeral"
  | "map-overlay"
  | "highlights"
  | "asset-hover"
  | "grid"
  | "zones";

export const FeatureSources = {
  MAIN: "main-features" as const,
  DELTA: "delta-features" as const,
} satisfies Record<string, DataSource>;
