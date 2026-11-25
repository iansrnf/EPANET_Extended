import { isDemoNetworkAtom, projectFileInfoAtom } from "src/state/file-system";
import { useHasUnsavedChanges } from "src/hooks/use-has-unsaved-changes";
import { projectSettingsAtom } from "src/state/project-settings";
import { useAtomValue } from "jotai";
import { truncate } from "src/lib/utils";
import { UnsavedChangesIcon, FileBoxIcon } from "src/icons";
import { useTranslate } from "src/hooks/use-translate";
import { projectExtension } from "src/commands/save-project";
import clsx from "clsx";

export function FileInfo({ floating = false }: { floating?: boolean }) {
  const translate = useTranslate();
  const projectName = useAtomValue(projectSettingsAtom).name;
  const isDemo = useAtomValue(isDemoNetworkAtom);
  const hasUnsavedChanges = useHasUnsavedChanges();
  const projectFileInfo = useAtomValue(projectFileInfoAtom);

  const TypeIcon = FileBoxIcon;

  const isUnsavedProject = !projectFileInfo;
  const showUnsavedIndicator = hasUnsavedChanges || isUnsavedProject;

  const name = projectName ? `${projectName}${projectExtension}` : null;

  if (!name) return <div></div>;

  return (
    <div
      className={clsx(
        "min-w-0 items-center gap-x-1 [&_svg]:shrink-0",
        floating ? "flex" : "pl-3 flex-initial hidden sm:flex",
      )}
    >
      <TypeIcon aria-hidden="true" />
      <div
        className="min-w-0 text-size-small font-mono whitespace-nowrap truncate"
        title={floating ? undefined : name}
      >
        {floating ? name : truncate(name, 50)}{" "}
      </div>
      {showUnsavedIndicator && (
        <>
          <UnsavedChangesIcon aria-hidden="true" />
          <span className="sr-only">{translate("unsavedChanges")}</span>
        </>
      )}
      {isDemo && (
        <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase bg-warning-subtle text-warning rounded-full">
          {translate("demoShort")}
        </span>
      )}
    </div>
  );
}
