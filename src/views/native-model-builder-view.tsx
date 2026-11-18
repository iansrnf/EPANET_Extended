import { useBuildGisModel } from "src/commands/build-gis-model";
import { GisModelBuilder } from "./gis-model-builder";

export const NativeModelBuilderView = ({
  onClose,
  onStepChange,
}: {
  onClose: () => void;
  onStepChange: (step: string) => void;
}) => {
  const { build, openModel } = useBuildGisModel();
  return (
    <GisModelBuilder
      onClose={onClose}
      onBuild={build}
      onOpenModel={openModel}
      onStepChange={onStepChange}
    />
  );
};
