import { useCallback, useContext, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import type { LngLatBoundsLike } from "mapbox-gl";
import { defaultProjectSettings } from "@epanet-js/project-settings";
import type { Proj4Projection } from "@epanet-js/projections";
import { useStartNewProject } from "src/hooks/persistence/use-start-new-project";
import { useLabelMaxLength } from "src/hooks/use-label-max-length";
import { useTranslate } from "src/hooks/use-translate";
import { useUserTracking } from "src/infra/user-tracking";
import { captureError } from "src/infra/error-tracking";
import { MapContext } from "src/map";
import { notify } from "src/components/notifications";
import { WarningIcon } from "src/icons";
import { saveCustomAttributes } from "src/lib/db";
import {
  prepareGisModel,
  type PreparedGisModel,
} from "src/lib/model-builder/prepare-model";
import type {
  NetworkLayer,
  NetworkBuildOptions,
} from "src/lib/model-builder/network";
import type {
  GisBuildMetadata,
  GisBuildProgress,
} from "src/lib/model-builder/build-types";
import { elevationSourcesAtom } from "src/state/elevation-sources";
import { dialogAtom } from "src/state/dialog";
import { inpFileInfoAtom, projectFileInfoAtom } from "src/state/file-system";
import { markProjectUnsavedAtom } from "src/state/project-revision";
import { defaultSimulationSettings } from "src/simulation/simulation-settings";
import { useUnsavedChangesCheck } from "./check-unsaved-changes";
import { useShowNetworkReview } from "./show-network-review";

const geographicProjections = new Map<string, Proj4Projection>();

export const useBuildGisModel = () => {
  const preparedModel = useRef<PreparedGisModel | null>(null);
  const buildSequence = useRef(0);
  const isOpening = useRef(false);
  const sources = useAtomValue(elevationSourcesAtom);
  const setDialog = useSetAtom(dialogAtom);
  const labelMaxLength = useLabelMaxLength();
  const { startNewProject } = useStartNewProject();
  const checkUnsavedChanges = useUnsavedChangesCheck();
  const showNetworkReview = useShowNetworkReview();
  const markProjectUnsaved = useSetAtom(markProjectUnsavedAtom);
  const setInpFileInfo = useSetAtom(inpFileInfoAtom);
  const setProjectFileInfo = useSetAtom(projectFileInfoAtom);
  const userTracking = useUserTracking();
  const translate = useTranslate();
  const map = useContext(MapContext);

  const build = useCallback(
    async (
      layers: NetworkLayer[],
      options: NetworkBuildOptions,
      metadata: GisBuildMetadata,
      onProgress?: (progress: GisBuildProgress) => void,
    ) => {
      const sequence = ++buildSequence.current;
      preparedModel.current = null;
      const prepared = await prepareGisModel(layers, options, metadata, {
        projections: geographicProjections,
        labelMaxLength,
        elevationSources: sources,
        onProgress,
        describeIssue: (issue) => {
          const detail = translate(
            `convertModel.issue.${issue.code}`,
            ...Object.values(issue.context ?? {}).map(String),
          );
          return issue.ref ? `${issue.ref}: ${detail}` : detail;
        },
      });
      metadata.signal?.throwIfAborted();
      if (sequence !== buildSequence.current) {
        throw new DOMException(
          "This build was replaced by a newer build.",
          "AbortError",
        );
      }
      preparedModel.current = prepared;
      return prepared.report;
    },
    [sources, labelMaxLength, translate],
  );

  const openModel = useCallback(() => {
    if (!preparedModel.current || isOpening.current) return;
    checkUnsavedChanges(async () => {
      const prepared = preparedModel.current;
      if (!prepared || isOpening.current) return;
      isOpening.current = true;
      setDialog({ type: "loading" });
      try {
        const { hydraulicModel, factories, projectSettings, bounds } =
          prepared.model;
        const started = await startNewProject({
          hydraulicModel,
          factories,
          projectSettings: {
            ...defaultProjectSettings,
            ...projectSettings,
            name: prepared.name,
          },
          simulationSettings: {
            ...defaultSimulationSettings,
            timing: { ...defaultSimulationSettings.timing, duration: 0 },
          },
        });
        if (!started) return;
        if (hydraulicModel.customAttributes.size > 0) {
          await saveCustomAttributes(hydraulicModel.customAttributes);
        }
        bounds.map((extent) => {
          map?.map.fitBounds(extent as LngLatBoundsLike, {
            padding: 100,
            duration: 0,
          });
        });
        setInpFileInfo(null);
        setProjectFileInfo(null);
        markProjectUnsaved();
        userTracking.capture({ name: "modelBuilder.completed" });
        showNetworkReview({ source: "auto" });
      } catch (error) {
        captureError(error instanceof Error ? error : new Error(String(error)));
        notify({
          variant: "error",
          title: translate("projectOpenFailed"),
          description: error instanceof Error ? error.message : String(error),
          Icon: WarningIcon,
        });
      } finally {
        setDialog(null);
        isOpening.current = false;
      }
    });
  }, [
    checkUnsavedChanges,
    startNewProject,
    map,
    setInpFileInfo,
    setProjectFileInfo,
    markProjectUnsaved,
    userTracking,
    showNetworkReview,
    translate,
    setDialog,
  ]);

  return { build, openModel };
};
