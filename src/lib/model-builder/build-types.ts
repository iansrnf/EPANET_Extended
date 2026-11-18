import type { FlowUnit } from "@epanet-js/quantity";

export type GisBuildMetadata = {
  name: string;
  flowUnit: FlowUnit;
  unitSystem: "metric" | "us";
  fetchElevations?: boolean;
  signal?: AbortSignal;
};

export type GisBuildProgress = {
  stage: string;
  progress: number;
  completedStages?: GisBuildStage[];
};

export type GisBuildStage = { stage: string; durationMs: number };

export type GisBuildIssue = {
  severity: "warning" | "error" | "info";
  message: string;
};

export type GisBuildResult = {
  assetCount: number;
  issues: GisBuildIssue[];
  summary: Record<string, number>;
  stages?: GisBuildStage[];
};
