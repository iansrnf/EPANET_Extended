export const toArrayBufferView = (
  bytes: Uint8Array,
): Uint8Array<ArrayBuffer> =>
  bytes.buffer instanceof ArrayBuffer
    ? (bytes as Uint8Array<ArrayBuffer>)
    : new Uint8Array(bytes);
