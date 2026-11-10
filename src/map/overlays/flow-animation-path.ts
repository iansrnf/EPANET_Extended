import {
  DEFAULT_FLOW_COLORS,
  interpolateFlowColor,
} from "./flow-animation-colors";

export const FLOW_PARTICLE_SPACING = 32;
export const FLOW_TRAIL_LENGTH = 13;
export const FLOW_ENDPOINT_GAP = 4;

const BASE_FLOW_SPEED = 60;
const FLOW_SPEED_MULTIPLIER = 2;
const FLOW_COLOR_BANDS = 32;

export type FlowAnimationPoint = { x: number; y: number };

export type FlowAnimationStyle = { speed: number; color: string };

export type FlowAnimationPath = {
  points: FlowAnimationPoint[];
  cumulativeLengths: number[];
  length: number;
};

export const buildFlowAnimationPath = (
  coordinates: readonly (readonly number[])[],
  project: (coordinates: readonly number[]) => FlowAnimationPoint,
): FlowAnimationPath | null => {
  const points: FlowAnimationPoint[] = [];
  const cumulativeLengths: number[] = [];
  let length = 0;

  for (const coordinate of coordinates) {
    if (!Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) {
      return null;
    }
    const point = project(coordinate);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;

    const previous = points.at(-1);
    if (previous) {
      const segmentLength = Math.hypot(
        point.x - previous.x,
        point.y - previous.y,
      );
      if (segmentLength === 0) continue;
      length += segmentLength;
      if (!Number.isFinite(length)) return null;
    }
    points.push(point);
    cumulativeLengths.push(length);
  }

  if (length < FLOW_ENDPOINT_GAP * 2 + 4) return null;
  return { points, cumulativeLengths, length };
};

export const pointAlongFlowPath = (
  path: FlowAnimationPath,
  distance: number,
): FlowAnimationPoint => {
  const clampedDistance = Math.max(
    0,
    Math.min(path.length, Number.isNaN(distance) ? 0 : distance),
  );
  let start = 0;
  let end = path.points.length - 1;

  while (end - start > 1) {
    const middle = (start + end) >>> 1;
    if (path.cumulativeLengths[middle] < clampedDistance) {
      start = middle;
    } else {
      end = middle;
    }
  }

  const segmentStart = path.points[start];
  const segmentEnd = path.points[end];
  const fraction =
    (clampedDistance - path.cumulativeLengths[start]) /
    (path.cumulativeLengths[end] - path.cumulativeLengths[start]);
  return {
    x: segmentStart.x + (segmentEnd.x - segmentStart.x) * fraction,
    y: segmentStart.y + (segmentEnd.y - segmentStart.y) * fraction,
  };
};

export const resolveFlowAnimationStyle = ({
  flow,
  status,
  isActive = true,
  isVisible = true,
  maximumFlow,
  colors = DEFAULT_FLOW_COLORS,
}: {
  flow: number | null | undefined;
  status: string | undefined;
  isActive?: boolean;
  isVisible?: boolean;
  maximumFlow: number;
  colors?: readonly string[];
}): FlowAnimationStyle | null => {
  if (
    flow == null ||
    !Number.isFinite(flow) ||
    flow === 0 ||
    status !== "open" ||
    !isActive ||
    !isVisible ||
    !Number.isFinite(maximumFlow) ||
    maximumFlow <= 0
  ) {
    return null;
  }

  const ratio = Math.min(1, Math.max(0, Math.abs(flow) / maximumFlow));
  const colorRatio =
    Math.round(ratio * (FLOW_COLOR_BANDS - 1)) / (FLOW_COLOR_BANDS - 1);

  return {
    speed: Math.sign(flow) * BASE_FLOW_SPEED * FLOW_SPEED_MULTIPLIER * ratio,
    color: interpolateFlowColor(colors, colorRatio),
  };
};
