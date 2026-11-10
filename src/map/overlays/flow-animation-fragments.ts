import {
  buildFlowAnimationPath,
  FLOW_ENDPOINT_GAP,
  FLOW_TRAIL_LENGTH,
  type FlowAnimationPath,
  type FlowAnimationPoint,
} from "./flow-animation-path";

export type FlowAnimationFragment = {
  path: FlowAnimationPath;
  offset: number;
  startGap: number;
  endGap: number;
};

export const visibleFlowAnimationFragments = (
  path: FlowAnimationPath,
  width: number,
  height: number,
): FlowAnimationFragment[] => {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return [];
  }

  const fragments: FlowAnimationFragment[] = [];
  let points: FlowAnimationPoint[] = [];
  let offset = 0;
  let endDistance = 0;
  let startGap = 0;
  let endGap = 0;
  const finish = () => {
    if (points.length > 1) {
      const fragmentPath = buildFlowAnimationPath(
        points.map((point) => [point.x, point.y]),
        (point) => ({ x: point[0], y: point[1] }),
      );
      if (fragmentPath) {
        fragments.push({ path: fragmentPath, offset, startGap, endGap });
      }
    }
    points = [];
  };

  for (let index = 1; index < path.points.length; index++) {
    const segment = clipSegment(
      path.points[index - 1],
      path.points[index],
      width,
      height,
    );
    if (!segment || segment.from === segment.to) {
      finish();
      continue;
    }

    const segmentLength =
      path.cumulativeLengths[index] - path.cumulativeLengths[index - 1];
    const startDistance =
      path.cumulativeLengths[index - 1] + segmentLength * segment.from;
    if (points.length && startDistance - endDistance > 1e-7) finish();

    if (!points.length) {
      offset = startDistance;
      startGap = index === 1 && segment.from === 0 ? FLOW_ENDPOINT_GAP : 0;
      points.push(segment.start);
    }
    points.push(segment.end);
    endDistance =
      path.cumulativeLengths[index - 1] + segmentLength * segment.to;
    endGap =
      index === path.points.length - 1 && segment.to === 1
        ? FLOW_ENDPOINT_GAP
        : 0;
  }
  finish();
  return fragments;
};

const clipSegment = (
  start: FlowAnimationPoint,
  end: FlowAnimationPoint,
  width: number,
  height: number,
): {
  start: FlowAnimationPoint;
  end: FlowAnimationPoint;
  from: number;
  to: number;
} | null => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let from = 0;
  let to = 1;
  const boundaries = [
    [-dx, start.x + FLOW_TRAIL_LENGTH],
    [dx, width + FLOW_TRAIL_LENGTH - start.x],
    [-dy, start.y + FLOW_TRAIL_LENGTH],
    [dy, height + FLOW_TRAIL_LENGTH - start.y],
  ];
  for (const [direction, distance] of boundaries) {
    if (direction === 0) {
      if (distance < 0) return null;
      continue;
    }
    const fraction = distance / direction;
    if (direction < 0) from = Math.max(from, fraction);
    else to = Math.min(to, fraction);
    if (from > to) return null;
  }
  return {
    start: { x: start.x + from * dx, y: start.y + from * dy },
    end: { x: start.x + to * dx, y: start.y + to * dy },
    from,
    to,
  };
};
