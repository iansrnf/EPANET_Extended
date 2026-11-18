import { describe, expect, it } from "vitest";
import { toArrayBufferView } from "./array-buffer-view";

describe("toArrayBufferView", () => {
  it("preserves the byte range without copying ordinary buffers", () => {
    const buffer = new Uint8Array([10, 20, 30, 40]);
    const bytes = buffer.subarray(1, 3);

    const result = toArrayBufferView(bytes);

    expect(result).toBe(bytes);
    expect(result.buffer).toBe(buffer.buffer);
    expect(result.byteOffset).toBe(1);
    expect([...result]).toEqual([20, 30]);
  });

  it("copies only the selected bytes from shared memory", () => {
    const buffer = new Uint8Array(new SharedArrayBuffer(4));
    buffer.set([10, 20, 30, 40]);
    const bytes = buffer.subarray(1, 3);

    const result = toArrayBufferView(bytes);
    buffer[1] = 50;

    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.byteOffset).toBe(0);
    expect(result.byteLength).toBe(2);
    expect([...result]).toEqual([20, 30]);
  });
});
