import { describe, expect, it } from "vitest";
import {
  buildFlowAnimationPath,
  FLOW_ENDPOINT_GAP,
  FLOW_PARTICLE_SPACING,
  FLOW_TRAIL_LENGTH,
  pointAlongFlowPath,
} from "./flow-animation-path";
import { visibleFlowAnimationFragments } from "./flow-animation-fragments";

const pathFor = (coordinates: number[][]) =>
  buildFlowAnimationPath(coordinates, ([x, y]) => ({ x, y }))!;

describe("visible flow animation fragments", () => {
  it("keeps gaps only at actual pipe endpoints", () => {
    const full = visibleFlowAnimationFragments(
      pathFor([
        [10, 20],
        [90, 20],
      ]),
      100,
      100,
    )[0];
    expect(full.offset).toBe(0);
    expect(full.startGap).toBe(FLOW_ENDPOINT_GAP);
    expect(full.endGap).toBe(FLOW_ENDPOINT_GAP);

    const start = visibleFlowAnimationFragments(
      pathFor([
        [10, 20],
        [200, 20],
      ]),
      100,
      100,
    )[0];
    expect(start.startGap).toBe(FLOW_ENDPOINT_GAP);
    expect(start.endGap).toBe(0);

    const end = visibleFlowAnimationFragments(
      pathFor([
        [-100, 20],
        [90, 20],
      ]),
      100,
      100,
    )[0];
    expect(end.startGap).toBe(0);
    expect(end.endGap).toBe(FLOW_ENDPOINT_GAP);
  });

  it("preserves full-path distance and pulse phase when panning changes the clip", () => {
    const original = pathFor([
      [-100, 50],
      [200, 50],
    ]);
    const panned = pathFor([
      [-140, 50],
      [160, 50],
    ]);
    const first = visibleFlowAnimationFragments(original, 100, 100)[0];
    const second = visibleFlowAnimationFragments(panned, 100, 100)[0];
    expect(first.offset).toBe(100 - FLOW_TRAIL_LENGTH);
    expect(second.offset).toBe(first.offset + 40);
    expect(first.startGap).toBe(0);
    expect(first.endGap).toBe(0);

    const distanceAlongPipe = 160;
    const initialPoint = pointAlongFlowPath(
      first.path,
      distanceAlongPipe - first.offset,
    );
    const pannedPoint = pointAlongFlowPath(
      second.path,
      distanceAlongPipe - second.offset,
    );
    expect(pannedPoint.x).toBeCloseTo(initialPoint.x - 40);

    const pulsePhase = (localDistance: number, offset: number) =>
      (localDistance + offset) % FLOW_PARTICLE_SPACING;
    expect(
      pulsePhase(distanceAlongPipe - first.offset, first.offset),
    ).toBeCloseTo(pulsePhase(distanceAlongPipe - second.offset, second.offset));
  });

  it("retains traveled distance when a bent pipe exits and reenters the viewport", () => {
    const fragments = visibleFlowAnimationFragments(
      pathFor([
        [20, 50],
        [150, 50],
        [150, 80],
        [20, 80],
      ]),
      100,
      100,
    );

    expect(fragments).toHaveLength(2);
    expect(fragments[0].offset).toBe(0);
    expect(fragments[0].path.length).toBeCloseTo(80 + FLOW_TRAIL_LENGTH);
    expect(fragments[0].startGap).toBe(FLOW_ENDPOINT_GAP);
    expect(fragments[0].endGap).toBe(0);
    expect(fragments[1].offset).toBeCloseTo(210 - FLOW_TRAIL_LENGTH);
    expect(fragments[1].path.points[0]).toEqual({
      x: 100 + FLOW_TRAIL_LENGTH,
      y: 80,
    });
    expect(fragments[1].startGap).toBe(0);
    expect(fragments[1].endGap).toBe(FLOW_ENDPOINT_GAP);
  });

  it("measures a diagonal clip offset along its segment", () => {
    const fragment = visibleFlowAnimationFragments(
      pathFor([
        [-100, -100],
        [100, 100],
      ]),
      100,
      100,
    )[0];

    expect(fragment.offset).toBeCloseTo(
      Math.hypot(100 - FLOW_TRAIL_LENGTH, 100 - FLOW_TRAIL_LENGTH),
    );
    expect(fragment.path.points[0].x).toBeCloseTo(-FLOW_TRAIL_LENGTH);
    expect(fragment.path.points[0].y).toBeCloseTo(-FLOW_TRAIL_LENGTH);
    expect(fragment.startGap).toBe(0);
    expect(fragment.endGap).toBe(FLOW_ENDPOINT_GAP);
  });

  it("keeps reentry separate when outside travel returns to the same boundary point", () => {
    const fragments = visibleFlowAnimationFragments(
      pathFor([
        [20, 50],
        [150, 50],
        [20, 50],
      ]),
      100,
      100,
    );

    expect(fragments).toHaveLength(2);
    expect(fragments[0].path.points.at(-1)).toEqual(
      fragments[1].path.points[0],
    );
    expect(fragments[1].offset).toBeCloseTo(180 - FLOW_TRAIL_LENGTH);
    expect(fragments[1].offset).toBeGreaterThan(fragments[0].path.length);
  });

  it("skips offscreen and too-short clipped fragments", () => {
    expect(
      visibleFlowAnimationFragments(
        pathFor([
          [150, 10],
          [200, 10],
        ]),
        100,
        100,
      ),
    ).toEqual([]);
    expect(
      visibleFlowAnimationFragments(
        pathFor([
          [-100, 20],
          [-10, 20],
        ]),
        100,
        100,
      ),
    ).toEqual([]);
  });
});
