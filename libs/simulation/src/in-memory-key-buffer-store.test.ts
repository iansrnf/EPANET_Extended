import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryKeyBufferStore } from "./in-memory-key-buffer-store";

describe("InMemoryKeyBufferStore", () => {
  beforeEach(() => InMemoryKeyBufferStore.resetAll());

  it("isolates instance-owned results with the same app ID", async () => {
    const first = new InMemoryKeyBufferStore("app", { shared: false });
    const second = new InMemoryKeyBufferStore("app", { shared: false });
    const shared = new InMemoryKeyBufferStore("app");
    await first.save("results", new Uint8Array([1, 2, 3]).buffer);
    await second.save("results", new Uint8Array([4, 5, 6]).buffer);

    expect(new Uint8Array(await first.readSlice("results", 1, 2))).toEqual(
      new Uint8Array([2, 3]),
    );
    expect(new Uint8Array(await second.readSlice("results", 1, 2))).toEqual(
      new Uint8Array([5, 6]),
    );
    expect(shared.has("results")).toBe(false);
    expect(first.getAppId()).toBe("app");
  });

  it("preserves shared results and clearRun behavior by default", async () => {
    const writer = new InMemoryKeyBufferStore("app");
    const reader = new InMemoryKeyBufferStore("app");
    await writer.save("results", new Uint8Array([1, 2, 3]).buffer);

    await writer.clearRun();

    expect(new Uint8Array(await reader.readSlice("results", 0, 3))).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("clears only the owned run", async () => {
    const first = new InMemoryKeyBufferStore("app", { shared: false });
    const second = new InMemoryKeyBufferStore("app", { shared: false });
    const shared = new InMemoryKeyBufferStore("app");
    await first.save("results", new Uint8Array([1]).buffer);
    await first.save("node-stats", new Uint8Array([2]).buffer);
    await second.save("results", new Uint8Array([3]).buffer);
    await shared.save("results", new Uint8Array([4]).buffer);

    await first.clearRun();

    expect(first.getCount()).toBe(0);
    expect(await second.getSize("results")).toBe(1);
    expect(new Uint8Array(await shared.readSlice("results", 0, 1))).toEqual(
      new Uint8Array([4]),
    );
  });

  it("reads strided results from instance-owned buffers", async () => {
    const store = new InMemoryKeyBufferStore("app", { shared: false });
    await store.save("results", new Uint8Array([1, 2, 3, 4, 5, 6]).buffer);

    expect(
      new Uint8Array(await store.readBlockSeries("results", 1, 1, 2, 3)),
    ).toEqual(new Uint8Array([2, 4, 6]));
    expect(new Uint8Array(store.readSliceSync("results", 2, 2))).toEqual(
      new Uint8Array([3, 4]),
    );
  });
});
