import { useId, useRef, useState } from "react";
import clsx from "clsx";
import type { PumpDefinition } from "@epanet-js/hydraulic-model";
import { getPumpDefinitionErrors } from "@epanet-js/hydraulic-model";
import type { UnitsSpec } from "@epanet-js/project-settings";
import { useTranslate } from "src/hooks/use-translate";
import { HeadTab } from "./head-tab";
import { EfficiencyTab } from "./efficiency-tab";
import { MotorTab } from "./motor-tab";

export type PumpDefinitionEditorProps = {
  definition: PumpDefinition;
  units: UnitsSpec;
  readOnly?: boolean;
  speed?: number;
  onChange: (definition: PumpDefinition) => void;
};

const TABS = ["head", "efficiency", "motor"] as const;

export const PumpDefinitionEditor = ({
  definition,
  units,
  readOnly = false,
  speed = 1,
  onChange,
}: PumpDefinitionEditorProps) => {
  const translate = useTranslate();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("head");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const errors = getPumpDefinitionErrors(definition);
  const activeErrors = [
    ...new Set(
      errors
        .filter((error) => error.path.startsWith(activeTab))
        .map((error) => error.code),
    ),
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div
        role="tablist"
        aria-label={translate("pumpDefinitionEditor.tabsLabel")}
        className="grid grid-cols-3 gap-1 rounded-lg border bg-panel p-1"
      >
        {TABS.map((tab, index) => (
          <button
            key={tab}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-${tab}-tab`}
            aria-selected={activeTab === tab}
            aria-controls={`${id}-${tab}-panel`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => {
              let nextIndex = index;
              if (event.key === "ArrowRight")
                nextIndex = (index + 1) % TABS.length;
              else if (event.key === "ArrowLeft")
                nextIndex = (index + TABS.length - 1) % TABS.length;
              else if (event.key === "Home") nextIndex = 0;
              else if (event.key === "End") nextIndex = TABS.length - 1;
              else return;
              event.preventDefault();
              setActiveTab(TABS[nextIndex]);
              tabRefs.current[nextIndex]?.focus();
            }}
            className={clsx(
              "min-h-11 min-w-0 rounded-md px-2 py-2 text-size-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              activeTab === tab
                ? "bg-base text-accent shadow-sm"
                : "text-subtle hover:bg-base-hover hover:text-default",
            )}
          >
            {translate(`pumpDefinitionEditor.tabs.${tab}`)}
            {errors.some((error) => error.path.startsWith(tab)) && (
              <span className="ml-1 text-warning" aria-hidden="true">
                !
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-${activeTab}-panel`}
        aria-labelledby={`${id}-${activeTab}-tab`}
        className="space-y-4 focus-visible:outline-none"
        tabIndex={0}
      >
        {activeTab === "head" && (
          <HeadTab
            definition={definition}
            units={units}
            readOnly={readOnly}
            onChange={onChange}
          />
        )}
        {activeTab === "efficiency" && (
          <EfficiencyTab
            definition={definition}
            units={units}
            readOnly={readOnly}
            onChange={onChange}
          />
        )}
        {activeTab === "motor" && (
          <MotorTab
            definition={definition}
            units={units}
            readOnly={readOnly}
            speed={speed}
            onChange={onChange}
          />
        )}
        {activeErrors.length > 0 && (
          <div
            role="status"
            className="rounded-lg border border-warning bg-warning-subtle p-3 text-size-base text-warning"
          >
            <p className="font-semibold">
              {translate("pumpDefinitionEditor.reviewValues")}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {activeErrors.map((code) => (
                <li key={code}>
                  {translate(`pumpDefinitionEditor.validation.${code}`)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
