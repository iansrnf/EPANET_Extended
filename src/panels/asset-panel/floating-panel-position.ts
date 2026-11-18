type Point = { x: number; y: number };
type Size = { width: number; height: number };

export type FloatingPanelPosition = {
  left: number;
  top: number;
  side: "left" | "right";
};

export const getFloatingPanelPosition = (
  anchor: Point,
  viewport: Size,
  panel: Size,
): FloatingPanelPosition => {
  const width = Math.max(0, viewport.width);
  const height = Math.max(0, viewport.height);
  const panelWidth = Math.max(0, panel.width);
  const panelHeight = Math.max(0, panel.height);
  const horizontalInset = Math.min(12, Math.max(0, (width - panelWidth) / 2));
  const verticalInset = Math.min(12, Math.max(0, (height - panelHeight) / 2));
  const right = anchor.x + 24;
  const left = anchor.x - panelWidth - 24;
  const rightFits = right + panelWidth <= width - horizontalInset;
  const leftFits = left >= horizontalInset;
  const side =
    rightFits || (!leftFits && anchor.x <= width / 2) ? "right" : "left";

  return {
    left: clamp(
      side === "right" ? right : left,
      horizontalInset,
      Math.max(horizontalInset, width - panelWidth - horizontalInset),
    ),
    top: clamp(
      anchor.y - 56,
      verticalInset,
      Math.max(verticalInset, height - panelHeight - verticalInset),
    ),
    side,
  };
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
