import type { Pump, PumpDefinition } from "@epanet-js/hydraulic-model";
import { Button } from "src/components/elements";
import { useShowPumpDefinition } from "src/commands/show-pump-definition";
import { useTranslate } from "src/hooks/use-translate";
import { ChevronRightIcon, PumpIcon } from "src/icons";

export const PumpDefinitionSummary = ({
  pump,
  definitions,
}: {
  pump: Pump;
  definitions: PumpDefinition[];
}) => {
  const translate = useTranslate();
  const showPumpDefinition = useShowPumpDefinition();
  const definition = definitions.find(
    (item) => item.id === pump.pumpDefinitionId,
  );
  return (
    <div className="m-2 rounded-xl border bg-panel p-3">
      <div className="flex items-center gap-3">
        <div className="rounded-lg border bg-base p-2 text-accent">
          <PumpIcon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-size-base font-semibold text-default">
            {definition?.name ?? translate("pumpDefinitions.title")}
          </p>
          <p className="mt-0.5 text-size-small text-subtle">
            {definition
              ? translate(
                  `pumpDefinitionEditor.headTypes.${definition.head.type}`,
                )
              : translate("pumpDefinitions.sidebarHint")}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="primary"
        className="mt-3 min-h-11 w-full justify-between"
        onClick={() => showPumpDefinition(pump.id)}
      >
        {translate(
          definition ? "pumpDefinitions.edit" : "pumpDefinitions.configure",
        )}
        <ChevronRightIcon />
      </Button>
    </div>
  );
};
