import { describe, expect, it } from "vitest";
import { MAX_PRODUCT_IMAGE_BYTES, sniffImageType, validateImageFile } from "./image-file";

const bytes = (...values: number[]) => Buffer.from([...values, ...new Array(16).fill(0)]);
const ascii = (text: string, offset = 0) => Buffer.concat([Buffer.alloc(offset), Buffer.from(text), Buffer.alloc(16)]);

describe("sniffImageType", () => {
  it.each([
    [bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg"],
    [bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png"],
    [ascii("GIF89a"), "image/gif"],
    [Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(8)]), "image/webp"],
    [Buffer.concat([Buffer.alloc(4), Buffer.from("ftypavif"), Buffer.alloc(8)]), "image/avif"],
  ])("detects %#", (data, type) => {
    expect(sniffImageType(data)).toBe(type);
  });

  it("rejects SVG and unknown data", () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(2))).toBeNull();
  });
});

describe("validateImageFile", () => {
  it("uses the sniffed type, not the declared one", () => {
    expect(validateImageFile(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({ ok: true, contentType: "image/jpeg", extension: "jpg" });
  });

  it("rejects big or unknown files", () => {
    expect(validateImageFile(Buffer.alloc(MAX_PRODUCT_IMAGE_BYTES + 1, 0xff))).toMatchObject({ ok: false });
    expect(validateImageFile(Buffer.from("hello"))).toMatchObject({ ok: false });
  });
});
