import { getWorker, timedWith } from "@epanet-js/ejsdb";
import { toArrayBufferView } from "src/infra/array-buffer-view";

export const exportDb = async (): Promise<Blob> => {
  return timedWith(
    "exportDb",
    async () => {
      const worker = getWorker();
      const bytes = await worker.exportDb();
      return new Blob([toArrayBufferView(bytes)], {
        type: "application/octet-stream",
      });
    },
    (blob) => ({ bytes: blob.size }),
  );
};
