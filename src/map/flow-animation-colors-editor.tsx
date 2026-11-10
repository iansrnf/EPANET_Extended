import { useId, useState } from "react";
import { useAtomValue } from "jotai";
import * as Popover from "@radix-ui/react-popover";
import { HexColorInput, HexColorPicker } from "react-colorful";
import clsx from "clsx";
import { CheckIcon, ChevronDownIcon, CloseIcon } from "src/icons";
import { useTranslate } from "src/hooks/use-translate";
import { flowAnimationColorsAtom } from "src/state/flow-animation";
import { useSetFlowAnimationColors } from "src/commands/set-flow-animation-colors";
import {
  DEFAULT_FLOW_COLORS,
  FLOW_COLOR_PRESETS,
  resizeFlowColors,
} from "./overlays/flow-animation-colors";

export const FlowAnimationColorsEditor = () => {
  const translate = useTranslate();
  const colors = useAtomValue(flowAnimationColorsAtom);
  const setColors = useSetFlowAnimationColors();
  const [open, setOpen] = useState(false);
  const [selectedStop, setSelectedStop] = useState(0);
  const selectedIndex = Math.min(selectedStop, colors.length - 1);
  const selectedColor = colors[selectedIndex];
  const titleId = useId();
  const descriptionId = useId();
  const countId = useId();
  const hexId = useId();

  const updateSelectedColor = (color: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    setColors(
      colors.map((value, index) => (index === selectedIndex ? color : value)),
    );
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={translate("flowAnimation.colors.edit")}
          title={translate("flowAnimation.colors.edit")}
          className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-r-xl px-3 text-default transition-colors hover:bg-base-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span
            aria-hidden="true"
            className="h-5 w-7 rounded-md border"
            style={{ background: gradientFor(colors) }}
          />
          <ChevronDownIcon
            size="sm"
            aria-hidden="true"
            className={clsx(
              "text-subtle transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="z-50 w-[336px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border bg-popover text-default shadow-2xl outline-none"
          style={{
            maxHeight:
              "min(640px, var(--radix-popover-content-available-height, calc(100dvh - 24px)))",
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onKeyPress={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b bg-popover p-4 pb-3">
            <div className="min-w-0">
              <h3 id={titleId} className="text-size-heading-3 font-semibold">
                {translate("flowAnimation.colors.title")}
              </h3>
              <p
                id={descriptionId}
                className="mt-1 text-size-small text-subtle"
              >
                {translate("flowAnimation.colors.description")}
              </p>
            </div>
            <Popover.Close asChild>
              <button
                type="button"
                aria-label={translate("flowAnimation.colors.close")}
                className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-subtle hover:bg-base-hover focus-visible:outline-2 focus-visible:outline-accent"
              >
                <CloseIcon aria-hidden="true" />
              </button>
            </Popover.Close>
          </div>
          <div className="space-y-3 p-4">
            <div>
              <div
                aria-hidden="true"
                className="h-8 rounded-lg border"
                style={{ background: gradientFor(colors) }}
              />
              <div className="mt-1.5 flex items-center justify-between text-size-small text-subtle">
                <span>{translate("flowAnimation.colors.low")}</span>
                <span>{translate("flowAnimation.colors.high")}</span>
              </div>
            </div>

            <div>
              <div id={countId} className="mb-1.5 text-size-small font-medium">
                {translate("flowAnimation.colors.count")}
              </div>
              <div
                role="group"
                aria-labelledby={countId}
                className="grid grid-cols-5 gap-1 rounded-xl bg-panel p-1"
              >
                {[1, 2, 3, 4, 5].map((count) => (
                  <button
                    key={count}
                    type="button"
                    aria-label={translate(
                      "flowAnimation.colors.countOption",
                      String(count),
                    )}
                    aria-pressed={colors.length === count}
                    className={clsx(
                      "min-h-11 rounded-lg border text-size-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                      colors.length === count
                        ? "border-accent bg-popover text-accent shadow-sm"
                        : "border-transparent text-subtle hover:bg-base-hover hover:text-default",
                    )}
                    onClick={() => setColors(resizeFlowColors(colors, count))}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div
              role="group"
              aria-label={translate("flowAnimation.colors.chooseColor")}
              className="flex gap-2"
            >
              {colors.map((color, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={translate(
                    "flowAnimation.colors.color",
                    String(index + 1),
                  )}
                  aria-pressed={selectedIndex === index}
                  className={clsx(
                    "relative min-h-14 min-w-0 flex-1 overflow-hidden rounded-xl border p-1 text-size-small transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    selectedIndex === index
                      ? "border-accent bg-accent-tint text-accent"
                      : "bg-popover text-subtle hover:border-strong hover:bg-base-hover",
                  )}
                  onClick={() => setSelectedStop(index)}
                >
                  <span
                    aria-hidden="true"
                    className="block h-7 rounded-md border"
                    style={{ backgroundColor: color }}
                  />
                  <span className="mt-1 block font-medium">{index + 1}</span>
                  {selectedIndex === index && (
                    <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-popover text-accent shadow-sm">
                      <CheckIcon size="sm" aria-hidden="true" />
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <label htmlFor={hexId} className="text-size-small font-medium">
                {translate(
                  "flowAnimation.colors.color",
                  String(selectedIndex + 1),
                )}
              </label>
              <HexColorInput
                id={hexId}
                prefixed
                color={selectedColor}
                onChange={updateSelectedColor}
                onBlur={(event) => {
                  const color = event.currentTarget.value;
                  if (/^#[0-9a-f]{3}$/i.test(color)) {
                    updateSelectedColor(
                      `#${color
                        .slice(1)
                        .split("")
                        .map((channel) => channel.repeat(2))
                        .join("")}`,
                    );
                  }
                }}
                aria-label={translate("flowAnimation.colors.hex")}
                spellCheck={false}
                className="h-11 w-32 rounded-lg border bg-base px-3 font-mono text-size-small uppercase text-default focus-visible:outline-2 focus-visible:outline-accent"
              />
            </div>

            <HexColorPicker
              color={selectedColor}
              onChange={updateSelectedColor}
              style={{ width: "100%", height: 120 }}
            />

            <div>
              <div className="mb-1.5 text-size-small font-medium">
                {translate("flowAnimation.colors.presetLabel")}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {FLOW_COLOR_PRESETS.map((preset) => {
                  const selected =
                    colors.length === preset.colors.length &&
                    colors.every(
                      (color, index) =>
                        color.toLowerCase() ===
                        preset.colors[index].toLowerCase(),
                    );
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={selected}
                      className={clsx(
                        "min-h-12 rounded-lg border p-1 text-size-small transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                        selected
                          ? "border-accent bg-accent-tint text-accent"
                          : "text-subtle hover:border-strong hover:bg-base-hover",
                      )}
                      onClick={() => setColors(preset.colors)}
                    >
                      <span
                        aria-hidden="true"
                        className="mb-1 block h-4 rounded-sm border"
                        style={{ background: gradientFor(preset.colors) }}
                      />
                      {translate(preset.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="min-h-11 w-full rounded-xl border bg-panel px-3 text-size-small font-medium text-subtle hover:bg-base-hover hover:text-default focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => setColors(DEFAULT_FLOW_COLORS)}
            >
              {translate("flowAnimation.colors.reset")}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

const gradientFor = (colors: readonly string[]) =>
  `linear-gradient(90deg, ${
    colors.length === 1 ? `${colors[0]}, ${colors[0]}` : colors.join(", ")
  })`;
