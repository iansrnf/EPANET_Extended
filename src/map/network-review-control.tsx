import { useAtomValue } from "jotai";
import { useSetNetworkReviewOpen } from "src/commands/show-network-review";
import { useTranslate } from "src/hooks/use-translate";
import { NetworkReviewIcon } from "src/icons";
import { NetworkReview } from "src/panels/network-review";
import { networkReviewOpenAtom } from "src/state/network-review";
import { MapControlMenu } from "./map-control-menu";

export const NetworkReviewControl = () => {
  const translate = useTranslate();
  const open = useAtomValue(networkReviewOpenAtom);
  const setOpen = useSetNetworkReviewOpen();

  return (
    <div className="map-control-review absolute bottom-[calc(var(--simulation-controls-height,0px)+2rem+3*var(--map-control-target-size))] left-2 z-20">
      <MapControlMenu
        label={translate("networkReview.title")}
        icon={<NetworkReviewIcon size="lg" aria-hidden="true" />}
        open={open}
        onOpenChange={setOpen}
        size="wide"
        contentClassName="network-review-menu"
        closeLabel={translate("networkReview.close")}
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
          <NetworkReview showTitle={false} />
        </div>
      </MapControlMenu>
    </div>
  );
};
