import { describe, expect, it } from "vitest";
import {
  buildFlowAnimationPath,
  pointAlongFlowPath,
  resolveFlowAnimationStyle,
} from "./flow-animation-path";

const project = (coordinates: readonly number[]) => ({
  x: coordinates[0],
  y: coordinates[1],
});

describe("flow animation paths", () => {
  it("follows bends using distance along the pipe", () => {
    const path = buildFlowAnimationPath(
      [
        [0, 0],
        [30, 0],
        [30, 40],
      ],
      project,
    )!;

    expect(path.length).toBe(70);
    expect(pointAlongFlowPath(path, 20)).toEqual({ x: 20, y: 0 });
    expect(pointAlongFlowPath(path, 30)).toEqual({ x: 30, y: 0 });
    expect(pointAlongFlowPath(path, 50)).toEqual({ x: 30, y: 20 });
    expect(pointAlongFlowPath(path, -10)).toEqual({ x: 0, y: 0 });
    expect(pointAlongFlowPath(path, 90)).toEqual({ x: 30, y: 40 });
  });

  it("ignores repeated vertices without interrupting movement", () => {
    const path = buildFlowAnimationPath(
      [
        [0, 0],
        [0, 0],
        [30, 0],
        [30, 0],
        [30, 40],
      ],
      project,
    )!;

    expect(path.points).toHaveLength(3);
    expect(pointAlongFlowPath(path, 50)).toEqual({ x: 30, y: 20 });
  });

  it.each([
    { coordinates: [] },
    { coordinates: [[0, 0]] },
    {
      coordinates: [
        [0, 0],
        [0, 0],
      ],
    },
    {
      coordinates: [
        [0, 0],
        [10, 0],
      ],
    },
    {
      coordinates: [
        [0, 0],
        [NaN, 30],
        [0, 40],
      ],
    },
    {
      coordinates: [
        [0, 0],
        [Infinity, 30],
      ],
    },
  ])("skips undrawable geometry $coordinates", ({ coordinates }) => {
    expect(buildFlowAnimationPath(coordinates, project)).toBeNull();
  });

  it("skips projections that produce invalid screen coordinates", () => {
    expect(
      buildFlowAnimationPath(
        [
          [0, 0],
          [0, 40],
        ],
        () => ({ x: Infinity, y: 0 }),
      ),
    ).toBeNull();
  });
});

describe("flow animation style", () => {
  const styleFor = (
    flow: number | null | undefined,
    changes: Partial<Parameters<typeof resolveFlowAnimationStyle>[0]> = {},
  ) =>
    resolveFlowAnimationStyle({
      flow,
      status: "open",
      maximumFlow: 10,
      ...changes,
    });

  it("makes high flow noticeably faster and lets low flow approach zero", () => {
    const slow = styleFor(0.01)!;
    const medium = styleFor(1)!;
    const fast = styleFor(10)!;

    expect(slow.speed).toBeGreaterThan(0);
    expect(slow.speed).toBeLessThan(1);
    expect(fast.speed).toBeGreaterThan(8 * medium.speed);
    expect(fast.speed / medium.speed).toBeCloseTo(10);
    expect(fast.speed).toBeGreaterThan(100 * slow.speed);
    expect(styleFor(0.000001)!.speed).toBeLessThan(slow.speed / 100);
    expect(styleFor(1000000)!.speed).toBe(fast.speed);
  });

  it("reverses direction without changing magnitude or color", () => {
    const forward = styleFor(3)!;
    const reverse = styleFor(-3)!;

    expect(reverse.speed).toBe(-forward.speed);
    expect(reverse.color).toBe(forward.color);
  });

  it("keeps equivalent flow and maximum ratios consistent across units", () => {
    const litersPerSecond = styleFor(1);
    const litersPerMinute = styleFor(60, { maximumFlow: 600 });
    const cubicMetersPerHour = styleFor(3.6, { maximumFlow: 36 });

    expect(litersPerMinute!.speed).toBeCloseTo(litersPerSecond!.speed);
    expect(cubicMetersPerHour!.speed).toBeCloseTo(litersPerSecond!.speed);
    expect(litersPerMinute!.color).toBe(litersPerSecond!.color);
    expect(cubicMetersPerHour!.color).toBe(litersPerSecond!.color);
  });

  it("darkens from light blue through cyan to deep blue as flow rises", () => {
    const low = styleFor(0.01)!;
    const middle = styleFor(5)!;
    const high = styleFor(10)!;
    const brightness = (color: string) => {
      const [red, green, blue] = color.match(/\d+/g)!.map(Number);
      expect(blue).toBeGreaterThan(green);
      expect(green).toBeGreaterThan(red);
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };

    expect(low.color).toBe("rgb(186, 230, 253)");
    expect(high.color).toBe("rgb(29, 78, 216)");
    expect(brightness(low.color)).toBeGreaterThan(brightness(middle.color));
    expect(brightness(middle.color)).toBeGreaterThan(brightness(high.color));
  });

  it.each([0, -0, NaN, Infinity, -Infinity, null, undefined])(
    "does not animate an absent or invalid flow %s",
    (flow) => {
      expect(styleFor(flow)).toBeNull();
    },
  );

  it("stops closed, inactive, and hidden pipes", () => {
    expect(styleFor(10, { status: "closed" })).toBeNull();
    expect(styleFor(10, { status: undefined })).toBeNull();
    expect(styleFor(10, { isActive: false })).toBeNull();
    expect(styleFor(10, { isVisible: false })).toBeNull();
  });

  it.each([0, -1, NaN, Infinity, -Infinity])(
    "rejects an invalid maximum %s",
    (maximumFlow) => {
      expect(styleFor(1, { maximumFlow })).toBeNull();
    },
  );
});
