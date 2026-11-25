import { useAtomValue } from "jotai";
import { useSetCollectionsOpen } from "src/commands/show-collections";
import { useTranslate } from "src/hooks/use-translate";
import { BookmarkIcon } from "src/icons";
import { CollectionsPanel } from "src/panels/collections";
import { collectionsOpenAtom } from "src/state/collections";
import { MapControlMenu } from "./map-control-menu";

export const CollectionsControl = () => {
  const translate = useTranslate();
  const open = useAtomValue(collectionsOpenAtom);
  const setOpen = useSetCollectionsOpen();

  return (
    <div className="map-control-collections absolute bottom-[calc(var(--simulation-controls-height,0px)+1.75rem+2*var(--map-control-target-size))] left-2 z-20">
      <MapControlMenu
        label={translate("collections.title")}
        icon={<BookmarkIcon size="lg" aria-hidden="true" />}
        open={open}
        onOpenChange={setOpen}
        size="wide"
        contentClassName="collections-menu"
        closeLabel={translate("collections.close")}
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <CollectionsPanel />
        </div>
      </MapControlMenu>
    </div>
  );
};
