import { useCallback, useMemo } from "react";
import { useAtomValue } from "jotai";
import type { Patterns } from "src/hydraulic-model";
import { currentFileNameAtom } from "src/state/file-system";
import { useUserTracking } from "src/infra/user-tracking";
import { FileSystemHelpers } from "src/infra/storage";
import {
  serializePatternsToCsv,
  serializePatternsToXlsx,
  type ExportPatternsOptions,
} from "src/lib/operational-data-io/patterns/export-patterns";

export const useExportPatterns = (fileSuffix: string) => {
  const { capture } = useUserTracking();
  const fullNetworkName = useAtomValue(currentFileNameAtom) ?? "";
  const networkName = useMemo(() => {
    const dot = fullNetworkName.lastIndexOf(".");
    return fullNetworkName.substring(0, dot < 0 ? fullNetworkName.length : dot);
  }, [fullNetworkName]);

  const exportToCsv = useCallback(
    async (patterns: Patterns, options: ExportPatternsOptions) => {
      await FileSystemHelpers.downloadFile(
        `${networkName}-${fileSuffix}.csv`,
        serializePatternsToCsv(patterns, options),
      );
      capture({
        name: "patterns.exported",
        format: "csv",
        count: patterns.size,
      });
    },
    [networkName, fileSuffix, capture],
  );

  const exportToXlsx = useCallback(
    async (patterns: Patterns, options: ExportPatternsOptions) => {
      await FileSystemHelpers.downloadFile(
        `${networkName}-${fileSuffix}.xlsx`,
        await serializePatternsToXlsx(patterns, options),
      );
      capture({
        name: "patterns.exported",
        format: "xlsx",
        count: patterns.size,
      });
    },
    [networkName, fileSuffix, capture],
  );

  return { exportToCsv, exportToXlsx };
};
