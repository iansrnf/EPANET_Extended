export const MAX_FLOW_COLORS = 5;

export const DEFAULT_FLOW_COLORS: readonly string[] = [
  "#bae6fd",
  "#38bdf8",
  "#1d4ed8",
];

export const FLOW_COLOR_PRESETS = [
  {
    id: "blue",
    labelKey: "flowAnimation.colors.presets.blue",
    colors: DEFAULT_FLOW_COLORS,
  },
  {
    id: "teal",
    labelKey: "flowAnimation.colors.presets.teal",
    colors: ["#ccfbf1", "#5eead4", "#14b8a6", "#115e59"],
  },
  {
    id: "violet",
    labelKey: "flowAnimation.colors.presets.violet",
    colors: ["#ede9fe", "#c4b5fd", "#a78bfa", "#7c3aed", "#4c1d95"],
  },
  {
    id: "amber",
    labelKey: "flowAnimation.colors.presets.amber",
    colors: ["#fef3c7", "#fcd34d", "#f59e0b", "#92400e"],
  },
] as const;

export const isValidFlowColors = (
  value: unknown,
): value is readonly string[] => {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_FLOW_COLORS
  ) {
    return false;
  }
  for (const color of value) {
    if (typeof color !== "string" || !/^#[\da-f]{6}$/i.test(color))
      return false;
  }
  return true;
};

export const normalizeFlowColors = (value: unknown): readonly string[] =>
  isValidFlowColors(value) ? value : DEFAULT_FLOW_COLORS;

export const resizeFlowColors = (
  colors: readonly string[],
  count: number,
): readonly string[] => {
  const normalized = normalizeFlowColors(colors);
  const targetCount = Number.isNaN(count)
    ? normalized.length
    : Math.min(MAX_FLOW_COLORS, Math.max(1, Math.round(count)));
  if (targetCount === normalized.length) return normalized;
  if (targetCount === 1) return [normalized[0]];

  return Array.from({ length: targetCount }, (_, index) => {
    if (index === 0) return normalized[0];
    if (index === targetCount - 1) return normalized[normalized.length - 1];
    const channels = interpolateChannels(normalized, index / (targetCount - 1));
    const hexadecimal = channels
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("");
    return `#${hexadecimal}`;
  });
};

export const interpolateFlowColor = (
  colors: readonly string[],
  ratio: number,
): string => {
  const normalized = normalizeFlowColors(colors);
  const clampedRatio = Number.isNaN(ratio)
    ? 0
    : Math.min(1, Math.max(0, ratio));
  return `rgb(${interpolateChannels(normalized, clampedRatio).join(", ")})`;
};

const interpolateChannels = (
  colors: readonly string[],
  ratio: number,
): number[] => {
  const position = ratio * (colors.length - 1);
  const index = Math.floor(position);
  const start = colors[index];
  const end = colors[Math.min(index + 1, colors.length - 1)];
  const fraction = position - index;

  return [1, 3, 5].map((offset) => {
    const startChannel = Number.parseInt(start.slice(offset, offset + 2), 16);
    const endChannel = Number.parseInt(end.slice(offset, offset + 2), 16);
    return Math.round(startChannel + (endChannel - startChannel) * fraction);
  });
};
