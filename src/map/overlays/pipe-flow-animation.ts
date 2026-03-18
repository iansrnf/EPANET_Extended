import { PathLayer } from "@deck.gl/layers";
import { AssetsMap, Pipe } from "src/hydraulic-model";
import { hexToArray } from "src/lib/color";
import { colors } from "src/lib/constants";
import { ResultsReader } from "src/simulation/results-reader";
import { Position } from "src/types";

type PipeFlowAnimationData = {
  path: [number, number][];
  color: [number, number, number, number];
};

type PipeFlowAnimationPath = {
  coordinates: Position[];
  cumulativeLengths: number[];
  totalLength: number;
  flowDirection: 1 | -1;
  strength: number;
  isActive: boolean;
};

export type PipeFlowAnimationLayer = PathLayer<PipeFlowAnimationData>;
export type PipeFlowAnimationOverlay = PipeFlowAnimationLayer[];

const activeColor = hexToArray(colors.amber300, 0.95) as [
  number,
  number,
  number,
  number,
];
const inactiveColor = hexToArray(colors.gray300, 0.75) as [
  number,
  number,
  number,
  number,
];

export const buildPipeFlowAnimationOverlay = ({
  assets,
  simulationResults,
  phase,
}: {
  assets: AssetsMap;
  simulationResults: ResultsReader;
  phase: number;
}): PipeFlowAnimationOverlay => {
  const paths = buildAnimationPaths(assets, simulationResults);
  if (paths.length === 0) return [];

  const data = paths.flatMap((path) => buildAnimatedSegments(path, phase));
  if (data.length === 0) return [];

  const layerProps = {
    id: "pipe-flow-animation-layer",
    beforeId: "main-features-junctions",
    data,
    getPath: (d: PipeFlowAnimationData) => d.path,
    widthUnits: "meters",
    getWidth: 1.6,
    widthMinPixels: 3,
    widthMaxPixels: 7,
    getColor: (d: PipeFlowAnimationData) => d.color,
    opacity: 1,
    antialiasing: true,
    pickable: false,
  };

  return [new PathLayer<PipeFlowAnimationData>(layerProps as any)];
};

const buildAnimationPaths = (
  assets: AssetsMap,
  simulationResults: ResultsReader,
): PipeFlowAnimationPath[] => {
  const allFlows = simulationResults.getAllFlows();
  const maxAbsFlow = allFlows.reduce(
    (max, flow) => Math.max(max, Math.abs(flow)),
    0,
  );

  const paths: PipeFlowAnimationPath[] = [];

  for (const asset of assets.values()) {
    if (asset.type !== "pipe") continue;

    const pipe = asset as Pipe;
    const simulation = simulationResults.getPipe(pipe.id);
    if (!simulation || simulation.status !== "open") continue;
    if (simulation.flow === 0) continue;

    const coordinates = pipe.coordinates;
    if (coordinates.length < 2) continue;

    const cumulativeLengths = [0];
    let totalLength = 0;

    for (let i = 1; i < coordinates.length; i++) {
      const [x1, y1] = coordinates[i - 1];
      const [x2, y2] = coordinates[i];
      const segmentLength = Math.hypot(x2 - x1, y2 - y1);
      totalLength += segmentLength;
      cumulativeLengths.push(totalLength);
    }

    if (totalLength === 0) continue;

    const strength =
      maxAbsFlow > 0
        ? Math.min(1, Math.max(0.35, Math.abs(simulation.flow) / maxAbsFlow))
        : 0.6;
    const flowDirection = getPipeFlowDirection(assets, pipe, simulation.flow);

    paths.push({
      coordinates,
      cumulativeLengths,
      totalLength,
      flowDirection,
      strength,
      isActive: pipe.isActive,
    });
  }

  return paths;
};

const buildAnimatedSegments = (
  path: PipeFlowAnimationPath,
  phase: number,
): PipeFlowAnimationData[] => {
  const segments: PipeFlowAnimationData[] = [];
  const spacing = 0.22;
  const pulseLength = 0.08;
  const pulseCount = Math.ceil(1 / spacing) + 2;

  for (let i = 0; i < pulseCount; i++) {
    const directedHead = wrap01(phase + i * spacing);
    const directedTail = directedHead - pulseLength;

    const ranges =
      directedTail >= 0
        ? [[directedTail, directedHead]]
        : [
            [1 + directedTail, 1],
            [0, directedHead],
          ];

    for (const [tail, head] of ranges) {
      const actualTail = path.flowDirection > 0 ? tail : 1 - tail;
      const actualHead = path.flowDirection > 0 ? head : 1 - head;
      const segmentPath = slicePathBetweenProgress(
        path,
        Math.min(actualTail, actualHead),
        Math.max(actualTail, actualHead),
      );
      if (segmentPath.length < 2) continue;

      segments.push({
        path: segmentPath,
        color: scaleAlpha(
          path.isActive ? activeColor : inactiveColor,
          path.strength,
        ),
      });
    }
  }

  return segments;
};

const pointAtProgress = (
  path: PipeFlowAnimationPath,
  progress: number,
): [number, number] => {
  const clamped = Math.max(0, Math.min(1, progress));
  const targetDistance = clamped * path.totalLength;

  for (let i = 1; i < path.cumulativeLengths.length; i++) {
    const segmentStart = path.cumulativeLengths[i - 1];
    const segmentEnd = path.cumulativeLengths[i];

    if (targetDistance > segmentEnd) continue;

    const ratio =
      segmentEnd === segmentStart
        ? 0
        : (targetDistance - segmentStart) / (segmentEnd - segmentStart);

    const [x1, y1] = path.coordinates[i - 1];
    const [x2, y2] = path.coordinates[i];

    return [x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio];
  }

  const [x, y] = path.coordinates[path.coordinates.length - 1];
  return [x, y];
};

const slicePathBetweenProgress = (
  path: PipeFlowAnimationPath,
  startProgress: number,
  endProgress: number,
): [number, number][] => {
  const startDistance =
    Math.max(0, Math.min(1, startProgress)) * path.totalLength;
  const endDistance = Math.max(0, Math.min(1, endProgress)) * path.totalLength;

  if (endDistance <= startDistance) {
    const point = pointAtProgress(path, startProgress);
    return [point, point];
  }

  const points: [number, number][] = [pointAtDistance(path, startDistance)];

  for (let i = 1; i < path.cumulativeLengths.length - 1; i++) {
    const distance = path.cumulativeLengths[i];
    if (distance > startDistance && distance < endDistance) {
      const [x, y] = path.coordinates[i];
      points.push([x, y]);
    }
  }

  points.push(pointAtDistance(path, endDistance));
  return dedupeConsecutivePoints(points);
};

const pointAtDistance = (
  path: PipeFlowAnimationPath,
  targetDistance: number,
): [number, number] => {
  const clampedDistance = Math.max(
    0,
    Math.min(path.totalLength, targetDistance),
  );

  for (let i = 1; i < path.cumulativeLengths.length; i++) {
    const segmentStart = path.cumulativeLengths[i - 1];
    const segmentEnd = path.cumulativeLengths[i];

    if (clampedDistance > segmentEnd) continue;

    const ratio =
      segmentEnd === segmentStart
        ? 0
        : (clampedDistance - segmentStart) / (segmentEnd - segmentStart);

    const [x1, y1] = path.coordinates[i - 1];
    const [x2, y2] = path.coordinates[i];

    return [x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio];
  }

  const [x, y] = path.coordinates[path.coordinates.length - 1];
  return [x, y];
};

const dedupeConsecutivePoints = (
  points: [number, number][],
): [number, number][] => {
  if (points.length <= 1) return points;

  const deduped: [number, number][] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const previous = deduped[deduped.length - 1];
    const current = points[i];
    if (previous[0] !== current[0] || previous[1] !== current[1]) {
      deduped.push(current);
    }
  }

  return deduped;
};

const wrap01 = (value: number) => {
  return ((value % 1) + 1) % 1;
};

const scaleAlpha = (
  color: [number, number, number, number],
  strength: number,
): [number, number, number, number] => {
  return [color[0], color[1], color[2], Math.round(color[3] * strength)];
};

const getPipeFlowDirection = (
  assets: AssetsMap,
  pipe: Pipe,
  flow: number,
): 1 | -1 => {
  const [startNodeId, endNodeId] = pipe.connections;
  const startNode = assets.get(startNodeId);
  const endNode = assets.get(endNodeId);

  const startIsLoggerEndpoint =
    !!startNode?.isNode &&
    startNode.getProperty("pressureLoggerId") !== undefined;
  const endIsLoggerEndpoint =
    !!endNode?.isNode && endNode.getProperty("pressureLoggerId") !== undefined;

  if (startIsLoggerEndpoint !== endIsLoggerEndpoint) {
    return endIsLoggerEndpoint ? 1 : -1;
  }

  return flow < 0 ? -1 : 1;
};
