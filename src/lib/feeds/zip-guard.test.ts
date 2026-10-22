import { describe, expect, it } from "vitest";
import { checkZipLimits, MAX_UNCOMPRESSED_BYTES } from "./zip-guard";

/** Builds a minimal archive layout: local header, central directory entries, end record. */
function zip(sizes: number[]): Buffer {
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  const central = sizes.map((size) => {
    const entry = Buffer.alloc(46 + 1);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt32LE(size, 24);
    entry.writeUInt16LE(1, 28); // one-byte file name
    return entry;
  });
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sizes.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, directory, end]);
}

describe("checkZipLimits", () => {
  it("accepts small workbooks", () => {
    expect(checkZipLimits(zip([1000, 2000]))).toEqual({ ok: true });
  });

  it("rejects archives that inflate past the limit", () => {
    expect(checkZipLimits(zip([MAX_UNCOMPRESSED_BYTES, 10]))).toMatchObject({ ok: false });
  });

  it("rejects ZIP64 size markers", () => {
    expect(checkZipLimits(zip([0xffffffff]))).toMatchObject({ ok: false });
  });

  it("rejects files that are not zip archives", () => {
    expect(checkZipLimits(Buffer.from("sku,price\nA,1\n".repeat(5)))).toMatchObject({ ok: false });
  });

  it("rejects a corrupt central directory", () => {
    const data = zip([10]);
    data.writeUInt32LE(0, 30);
    expect(checkZipLimits(data)).toMatchObject({ ok: false });
  });
});
