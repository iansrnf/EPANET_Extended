import { getDbWorker } from "./get-db-worker";

export const exportDb = async (): Promise<Blob> => {
  const worker = getDbWorker();
  const bytes = await worker.exportDb();
  const copy = new Uint8Array(bytes);
  return new Blob([copy.buffer], { type: "application/octet-stream" });
};
