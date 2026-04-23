import { IKeyBufferStore } from "./types";

const ROOT_DIR = "epanet-simulation";
const HEARTBEAT_KEY_PREFIX = "last-simulation-access:";

export class OPFSStorage implements IKeyBufferStore {
  private readonly fallbackStorage: IndexedDBKeyBufferStore;

  constructor(
    private readonly appId: string,
    private readonly scenarioKey?: string,
    private readonly runId?: string,
  ) {
    this.fallbackStorage = new IndexedDBKeyBufferStore(
      appId,
      scenarioKey,
      runId,
    );
  }

  async save(filename: string, data: ArrayBuffer): Promise<void> {
    try {
      const dir = await this.getAppDir();
      const fileHandle = await dir.getFileHandle(filename, { create: true });
      await writeFile(fileHandle, data);
    } catch (error) {
      try {
        await this.fallbackStorage.save(filename, data);
      } catch {
        throw error;
      }
    }
  }

  async readSlice(
    filename: string,
    offset: number,
    length: number,
  ): Promise<ArrayBuffer> {
    try {
      const dir = await this.getAppDir();
      const fileHandle = await dir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      const slice = file.slice(offset, offset + length);
      const result = await slice.arrayBuffer();
      this.touchLastAccess();
      return result;
    } catch (error) {
      try {
        const result = await this.fallbackStorage.readSlice(
          filename,
          offset,
          length,
        );
        this.touchLastAccess();
        return result;
      } catch {
        throw error;
      }
    }
  }

  async readBlockSeries(
    filename: string,
    baseOffset: number,
    readSize: number,
    blockSize: number,
    blockCount: number,
  ): Promise<ArrayBuffer> {
    if (blockCount === 0) return new ArrayBuffer(0);

    try {
      // One large contiguous read is dramatically faster than many small slices,
      // but the strided range can be huge on big networks (blockSize = the full
      // per-timestep results record). We read it in chunks so the temporary
      // buffer stays bounded. The file handle is opened once and reused.
      const MAX_BYTES_PER_CHUNK = 64 * 1024 * 1024;
      const maxBlocksPerChunk = Math.max(
        1,
        Math.floor(MAX_BYTES_PER_CHUNK / blockSize),
      );

      const dir = await this.getAppDir();
      const fileHandle = await dir.getFileHandle(filename);
      const file = await fileHandle.getFile();

      type Chunk = { firstBlock: number; blocksInChunk: number };
      const chunks: Chunk[] = [];
      for (
        let firstBlock = 0;
        firstBlock < blockCount;
        firstBlock += maxBlocksPerChunk
      ) {
        chunks.push({
          firstBlock,
          blocksInChunk: Math.min(maxBlocksPerChunk, blockCount - firstBlock),
        });
      }

      const chunkBuffers = await Promise.all(
        chunks.map(({ firstBlock, blocksInChunk }) => {
          const chunkOffset = baseOffset + firstBlock * blockSize;
          const chunkLength = (blocksInChunk - 1) * blockSize + readSize;
          return file
            .slice(chunkOffset, chunkOffset + chunkLength)
            .arrayBuffer();
        }),
      );

      const result = new ArrayBuffer(readSize * blockCount);
      const dst = new Uint8Array(result);
      for (let c = 0; c < chunks.length; c++) {
        const { firstBlock, blocksInChunk } = chunks[c];
        const chunk = new Uint8Array(chunkBuffers[c]);
        for (let i = 0; i < blocksInChunk; i++) {
          const srcOffset = i * blockSize;
          const dstOffset = (firstBlock + i) * readSize;
          dst.set(chunk.subarray(srcOffset, srcOffset + readSize), dstOffset);
        }
      }

      this.touchLastAccess();
      return result;
    } catch (error) {
      try {
        const result = await this.fallbackStorage.readBlockSeries(
          filename,
          baseOffset,
          readSize,
          blockSize,
          blockCount,
        );
        this.touchLastAccess();
        return result;
      } catch {
        throw error;
      }
    }
  }

  async getSize(filename: string): Promise<number> {
    try {
      const dir = await this.getAppDir();
      const fileHandle = await dir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      return file.size;
    } catch (error) {
      try {
        return await this.fallbackStorage.getSize(filename);
      } catch {
        throw error;
      }
    }
  }

  async clear(): Promise<void> {
    await clearApp(this.appId);
    await ignoreUnavailableFallback(() => this.fallbackStorage.clear());
  }

  async clearRun(): Promise<void> {
    if (!this.runId) return;
    try {
      const root = await getRootDir();
      const appDir = await root.getDirectoryHandle(this.appId);
      const parentDir = this.scenarioKey
        ? await appDir.getDirectoryHandle(this.scenarioKey)
        : appDir;
      await parentDir.removeEntry(this.runId, { recursive: true });
    } catch {
      // Run directory may not exist (already cleaned by project init,
      // cleanupStaleOPFS, or a prior dispose). Safe to ignore.
    }
    await ignoreUnavailableFallback(() => this.fallbackStorage.clearRun());
  }

  private touchLastAccess(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      `${HEARTBEAT_KEY_PREFIX}${this.appId}`,
      JSON.stringify({ timestamp: Date.now() }),
    );
  }

  private async getAppDir(): Promise<FileSystemDirectoryHandle> {
    const root = await getRootDir();
    const appDir = await root.getDirectoryHandle(this.appId, { create: true });
    if (!this.scenarioKey) return appDir;
    const scenarioDir = await appDir.getDirectoryHandle(this.scenarioKey, {
      create: true,
    });
    if (!this.runId) return scenarioDir;
    return await scenarioDir.getDirectoryHandle(this.runId, { create: true });
  }
}

type SimulationFileRecord = {
  key: string;
  data: ArrayBuffer;
};

const FALLBACK_DB_NAME = "epanet-simulation-results";
const FALLBACK_DB_VERSION = 1;
const FALLBACK_STORE_NAME = "files";

class IndexedDBKeyBufferStore implements IKeyBufferStore {
  constructor(
    private readonly appId: string,
    private readonly scenarioKey?: string,
    private readonly runId?: string,
  ) {}

  async save(filename: string, data: ArrayBuffer): Promise<void> {
    const db = await openFallbackDb();
    try {
      const store = db
        .transaction(FALLBACK_STORE_NAME, "readwrite")
        .objectStore(FALLBACK_STORE_NAME);
      await requestToPromise(
        store.put({
          key: this.getKey(filename),
          data,
        } satisfies SimulationFileRecord),
      );
    } finally {
      db.close();
    }
  }

  async readSlice(
    filename: string,
    offset: number,
    length: number,
  ): Promise<ArrayBuffer> {
    const data = await this.readFile(filename);
    return data.slice(offset, offset + length);
  }

  async readBlockSeries(
    filename: string,
    baseOffset: number,
    readSize: number,
    blockSize: number,
    blockCount: number,
  ): Promise<ArrayBuffer> {
    if (blockCount === 0) return new ArrayBuffer(0);

    const data = await this.readFile(filename);
    const result = new ArrayBuffer(readSize * blockCount);
    const src = new Uint8Array(data);
    const dst = new Uint8Array(result);

    for (let i = 0; i < blockCount; i++) {
      const offset = baseOffset + i * blockSize;
      dst.set(src.subarray(offset, offset + readSize), i * readSize);
    }

    return result;
  }

  async getSize(filename: string): Promise<number> {
    return (await this.readFile(filename)).byteLength;
  }

  async clear(): Promise<void> {
    await this.deleteByPrefix(`${this.appId}/`);
  }

  async clearRun(): Promise<void> {
    if (!this.runId) return;
    await this.deleteByPrefix(this.getKey(""));
  }

  private async readFile(filename: string): Promise<ArrayBuffer> {
    const db = await openFallbackDb();
    try {
      const store = db
        .transaction(FALLBACK_STORE_NAME, "readonly")
        .objectStore(FALLBACK_STORE_NAME);
      const record = await requestToPromise<SimulationFileRecord | undefined>(
        store.get(this.getKey(filename)),
      );
      if (!record) throw new Error(`Key "${filename}" not found in storage`);
      return record.data;
    } finally {
      db.close();
    }
  }

  private async deleteByPrefix(prefix: string): Promise<void> {
    const db = await openFallbackDb();
    try {
      const store = db
        .transaction(FALLBACK_STORE_NAME, "readwrite")
        .objectStore(FALLBACK_STORE_NAME);
      const keys = await requestToPromise<IDBValidKey[]>(store.getAllKeys());
      await Promise.all(
        keys
          .filter((key) => typeof key === "string" && key.startsWith(prefix))
          .map((key) => requestToPromise(store.delete(key))),
      );
    } finally {
      db.close();
    }
  }

  private getKey(filename: string): string {
    return [this.appId, this.scenarioKey, this.runId, filename]
      .filter((part): part is string => !!part)
      .join("/");
  }
}

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const openFallbackDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(FALLBACK_DB_NAME, FALLBACK_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FALLBACK_STORE_NAME)) {
        db.createObjectStore(FALLBACK_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const ignoreUnavailableFallback = async (
  action: () => Promise<void>,
): Promise<void> => {
  try {
    await action();
  } catch {
    // In tests or old browsers IndexedDB can be unavailable. Cleanup should
    // remain best-effort, just like OPFS cleanup above.
  }
};

type SyncFileHandle = FileSystemFileHandle & {
  createSyncAccessHandle?: () => Promise<{
    write: (data: BufferSource) => void;
    close: () => void;
  }>;
};

const writeFile = async (
  fileHandle: FileSystemFileHandle,
  data: ArrayBuffer,
): Promise<void> => {
  const syncFileHandle = fileHandle as SyncFileHandle;
  if (syncFileHandle.createSyncAccessHandle) {
    try {
      const accessHandle = await syncFileHandle.createSyncAccessHandle();
      accessHandle.write(data);
      accessHandle.close();
      return;
    } catch {
      // Some production runtimes expose createSyncAccessHandle but reject it.
      // Fall back to the standard async writer rather than failing simulation.
    }
  }

  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
};

export async function cleanupStaleOPFS(thresholdMs: number): Promise<void> {
  const staleAppIds = findStaleAppIds(thresholdMs);

  for (const appId of staleAppIds) {
    await clearApp(appId);
  }
}

async function getRootDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle(ROOT_DIR, { create: true });
}

async function clearApp(appId: string): Promise<void> {
  try {
    const root = await getRootDir();
    await root.removeEntry(appId, { recursive: true });
  } catch {
    // Directory may not exist
  }

  localStorage.removeItem(`${HEARTBEAT_KEY_PREFIX}${appId}`);
}

function findStaleAppIds(thresholdMs: number): string[] {
  const now = Date.now();
  const staleAppIds: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(HEARTBEAT_KEY_PREFIX)) continue;

    try {
      const data = localStorage.getItem(key);
      const { timestamp } = JSON.parse(data || "{}") as { timestamp: number };
      if (now - timestamp > thresholdMs) {
        staleAppIds.push(key.slice(HEARTBEAT_KEY_PREFIX.length));
      }
    } catch {
      staleAppIds.push(key.slice(HEARTBEAT_KEY_PREFIX.length));
    }
  }

  return staleAppIds;
}
