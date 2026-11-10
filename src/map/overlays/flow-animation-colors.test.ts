import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLOW_COLORS,
  FLOW_COLOR_PRESETS,
  MAX_FLOW_COLORS,
  interpolateFlowColor,
  isValidFlowColors,
  normalizeFlowColors,
  resizeFlowColors,
} from "./flow-animation-colors";

describe("flow animation palette storage", () => {
  it.each(
    [
      undefined,
      null,
      "#bae6fd",
      {},
      [],
      Array(3),
      ["#123456", 123],
      ["#123456", "invalid"],
      ["#123"],
      ["#12345g"],
      ["#123456", "#234567", "#345678", "#456789", "#56789a", "#6789ab"],
    ].map((value) => ({ value })),
  )("falls back for malformed stored colors $value", ({ value }) => {
    expect(isValidFlowColors(value)).toBe(false);
    expect(normalizeFlowColors(value)).toBe(DEFAULT_FLOW_COLORS);
  });

  it("keeps custom stop order and valid stored colors", () => {
    const colors = ["#112233", "#FFFFFF", "#000000"];

    expect(isValidFlowColors(colors)).toBe(true);
    expect(normalizeFlowColors(colors)).toBe(colors);
    expect(colors).toEqual(["#112233", "#FFFFFF", "#000000"]);
  });

  it("provides valid presets within the five-color limit", () => {
    expect(FLOW_COLOR_PRESETS.map((preset) => preset.id)).toEqual([
      "blue",
      "teal",
      "violet",
      "amber",
    ]);
    for (const preset of FLOW_COLOR_PRESETS) {
      expect(normalizeFlowColors(preset.colors)).toBe(preset.colors);
      expect(preset.colors.length).toBeGreaterThanOrEqual(3);
      expect(preset.colors.length).toBeLessThanOrEqual(MAX_FLOW_COLORS);
    }
  });
});

describe("flow animation palette interpolation", () => {
  it("uses a single color across the whole flow range", () => {
    for (const ratio of [0, 0.1, 0.5, 1]) {
      expect(interpolateFlowColor(["#123456"], ratio)).toBe("rgb(18, 52, 86)");
    }
  });

  it("interpolates two colors and clamps endpoints", () => {
    const colors = ["#000000", "#ffffff"];

    expect(interpolateFlowColor(colors, 0.5)).toBe("rgb(128, 128, 128)");
    expect(interpolateFlowColor(colors, -1)).toBe("rgb(0, 0, 0)");
    expect(interpolateFlowColor(colors, 2)).toBe("rgb(255, 255, 255)");
    expect(interpolateFlowColor(colors, NaN)).toBe("rgb(0, 0, 0)");
  });

  it("positions five custom stops evenly without sorting them", () => {
    const colors = ["#000000", "#ff0000", "#00ff00", "#0000ff", "#ffffff"];

    expect(interpolateFlowColor(colors, 0)).toBe("rgb(0, 0, 0)");
    expect(interpolateFlowColor(colors, 0.125)).toBe("rgb(128, 0, 0)");
    expect(interpolateFlowColor(colors, 0.25)).toBe("rgb(255, 0, 0)");
    expect(interpolateFlowColor(colors, 0.5)).toBe("rgb(0, 255, 0)");
    expect(interpolateFlowColor(colors, 0.75)).toBe("rgb(0, 0, 255)");
    expect(interpolateFlowColor(colors, 1)).toBe("rgb(255, 255, 255)");
  });
});

describe("flow animation palette resizing", () => {
  it("resamples the current gradient while preserving endpoints", () => {
    const colors = ["#000000", "#ff0000", "#ffffff"];

    expect(resizeFlowColors(colors, 5)).toEqual([
      "#000000",
      "#800000",
      "#ff0000",
      "#ff8080",
      "#ffffff",
    ]);
    expect(resizeFlowColors(colors, 2)).toEqual(["#000000", "#ffffff"]);
    expect(colors).toEqual(["#000000", "#ff0000", "#ffffff"]);
  });

  it("uses the first color for a single stop and caps the count", () => {
    expect(resizeFlowColors(DEFAULT_FLOW_COLORS, 1)).toEqual(["#bae6fd"]);
    expect(resizeFlowColors(DEFAULT_FLOW_COLORS, 0)).toEqual(["#bae6fd"]);
    expect(resizeFlowColors(DEFAULT_FLOW_COLORS, 20)).toHaveLength(5);
    expect(resizeFlowColors(["#123456"], 5)).toEqual(Array(5).fill("#123456"));
  });
});
