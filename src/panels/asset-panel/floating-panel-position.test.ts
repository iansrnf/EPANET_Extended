import { describe, expect, it } from "vitest";
import { getFloatingPanelPosition } from "./floating-panel-position";

describe("getFloatingPanelPosition", () => {
  const viewport = { width: 1000, height: 700 };
  const panel = { width: 320, height: 400 };

  it("opens beside the anchor with its header aligned", () => {
    expect(
      getFloatingPanelPosition({ x: 100, y: 160 }, viewport, panel),
    ).toEqual({ left: 124, top: 104, side: "right" });
  });

  it("flips left near the right edge", () => {
    expect(
      getFloatingPanelPosition({ x: 900, y: 160 }, viewport, panel),
    ).toEqual({ left: 556, top: 104, side: "left" });
  });

  it.each([
    { anchorY: 0, expectedTop: 12 },
    { anchorY: 700, expectedTop: 288 },
  ])("keeps edge anchors inside the map", ({ anchorY, expectedTop }) => {
    const position = getFloatingPanelPosition(
      { x: 100, y: anchorY },
      viewport,
      panel,
    );

    expect(position.top).toBe(expectedTop);
    expect(position.top + panel.height).toBeLessThanOrEqual(
      viewport.height - 12,
    );
  });

  it("clamps a panel that fills a narrow map", () => {
    expect(
      getFloatingPanelPosition(
        { x: 20, y: 160 },
        { width: 360, height: 700 },
        { width: 336, height: 400 },
      ),
    ).toEqual({ left: 12, top: 104, side: "right" });
  });

  it("uses the side with more room when neither side fits", () => {
    const smallViewport = { width: 500, height: 700 };

    expect(
      getFloatingPanelPosition({ x: 220, y: 160 }, smallViewport, panel).side,
    ).toBe("right");
    expect(
      getFloatingPanelPosition({ x: 280, y: 160 }, smallViewport, panel).side,
    ).toBe("left");
  });

  it("keeps positions nonnegative while the viewport is resizing", () => {
    expect(
      getFloatingPanelPosition(
        { x: 100, y: 100 },
        { width: 200, height: 160 },
        panel,
      ),
    ).toEqual({ left: 0, top: 0, side: "right" });
    expect(
      getFloatingPanelPosition({ x: 0, y: 0 }, { width: 0, height: 0 }, panel),
    ).toEqual({ left: 0, top: 0, side: "right" });
  });

  it("keeps the inspector available when its anchor pans offscreen", () => {
    expect(
      getFloatingPanelPosition({ x: -50, y: 800 }, viewport, panel),
    ).toEqual({ left: 12, top: 288, side: "right" });
  });
});
