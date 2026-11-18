import { useCallback } from "react";
import dynamic from "next/dynamic";
import { useAtom } from "jotai";
import { contentViewAtom } from "src/state/content-view";
import {
  ModelBuilderFrame,
  type ModelBuilderContext,
} from "./model-builder-iframe";
import { useUserTracking } from "src/infra/user-tracking";
import { isModelBuilderEmbedded } from "src/global-config";
import { Loading } from "src/components/elements";

const NativeModelBuilderView = dynamic(
  () =>
    import("./native-model-builder-view").then(
      (module) => module.NativeModelBuilderView,
    ),
  { ssr: false, loading: () => <Loading /> },
);

export const ModelBuildView = () => {
  const userTracking = useUserTracking();
  const [contentView, setContentView] = useAtom(contentViewAtom);
  const step = contentView?.type === "modelBuild" ? contentView.step : null;

  const handleContextChange = useCallback(
    (context: ModelBuilderContext) => {
      setContentView((view) =>
        view?.type === "modelBuild"
          ? { type: "modelBuild", step: context.step ?? null }
          : view,
      );
    },
    [setContentView],
  );

  const handleClose = useCallback(() => {
    userTracking.capture({ name: "modelBuilder.closed", step });
    setContentView(null);
  }, [userTracking, step, setContentView]);

  const handleStepChange = useCallback(
    (nextStep: string) => handleContextChange({ step: nextStep }),
    [handleContextChange],
  );

  if (!isModelBuilderEmbedded) {
    return (
      <NativeModelBuilderView
        onClose={handleClose}
        onStepChange={handleStepChange}
      />
    );
  }

  return (
    <ModelBuilderFrame
      onContextChange={handleContextChange}
      onClose={handleClose}
    />
  );
};
