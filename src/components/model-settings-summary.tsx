import { useAtomValue } from "jotai";
import { localizeDecimal } from "@epanet-js/i18n";
import { useLocale } from "src/hooks/use-locale";
import { useTranslate } from "src/hooks/use-translate";
import { useTranslateUnit } from "src/hooks/use-translate-unit";
import { simulationSettingsDerivedAtom } from "src/state/derived-branch-state";
import { autoElevationsAtom } from "src/state/drawing";
import { projectSettingsAtom } from "src/state/project-settings";

export const ModelSettingsSummary = () => {
  const translate = useTranslate();
  const translateUnit = useTranslateUnit();
  const { locale } = useLocale();
  const projectSettings = useAtomValue(projectSettingsAtom);
  const simulationSettings = useAtomValue(simulationSettingsDerivedAtom);
  const autoElevations = useAtomValue(autoElevationsAtom);

  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-4 gap-y-3 text-size-small">
      <dt className="text-subtle">
        {translate("simulationSettings.flowUnits")}
      </dt>
      <dd className="text-right text-default">
        {translateUnit(projectSettings.units.flow)}
      </dd>
      <dt className="text-subtle">
        {translate("simulationSettings.pressureUnits")}
      </dt>
      <dd className="text-right text-default">
        {translateUnit(projectSettings.units.pressure)}
      </dd>
      <dt className="text-subtle">
        {translate("simulationSettings.headlossFormula")}
      </dt>
      <dd className="text-right text-default">
        {projectSettings.headlossFormula}
      </dd>
      <dt className="text-subtle">
        {translate("simulationSettings.globalDemandMultiplier")}
      </dt>
      <dd className="text-right text-default">
        {localizeDecimal(simulationSettings.globalDemandMultiplier, { locale })}
      </dd>
      <dt className="text-subtle">{translate("autoLengths")}</dt>
      <dd className="text-right text-default">{translate("on")}</dd>
      <dt className="text-subtle">{translate("autoElevations")}</dt>
      <dd className="text-right text-default">
        {translate(autoElevations ? "on" : "off")}
      </dd>
    </dl>
  );
};
