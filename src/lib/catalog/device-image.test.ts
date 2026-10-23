import { crc32 } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { DEVICE_IMAGE_MAX_BYTES, DEVICE_IMAGE_SIZE, processDeviceImage } from "./device-image";

async function noisyPng(width: number, height: number): Promise<Buffer> {
  // Random pixels compress badly, so this forces the quality ladder to work
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 2654435761) >>> 24;
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const name = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([head, name, data, crc]);
}

/** A PNG with a valid header claiming the given size but no pixel data. */
function pngHeader(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function solid(format: "jpeg" | "png" | "webp", width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 160, b: 70 } } })
    .toFormat(format)
    .toBuffer();
}

describe("processDeviceImage", () => {
  it("turns a large photo into a 192x192 WebP within the size budget", async () => {
    const result = await processDeviceImage(await solid("jpeg", 2000, 1200));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.body).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(DEVICE_IMAGE_SIZE);
    expect(meta.height).toBe(DEVICE_IMAGE_SIZE);
    expect(result.body.length).toBeLessThanOrEqual(DEVICE_IMAGE_MAX_BYTES);
    expect(result.contentType).toBe("image/webp");
  });

  it("keeps the whole device in frame on a transparent square", async () => {
    const result = await processDeviceImage(await solid("png", 400, 100));
    if (!result.ok) throw new Error(result.error);
    const { data, info } = await sharp(result.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(96, 96)).toBe(255);
  });

  it("lowers quality until a detailed image fits the budget", async () => {
    const result = await processDeviceImage(await noisyPng(800, 800));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.length).toBeLessThanOrEqual(DEVICE_IMAGE_MAX_BYTES);
  });

  it("upscales a small image to the full square", async () => {
    const result = await processDeviceImage(await solid("webp", 64, 64));
    if (!result.ok) throw new Error(result.error);
    expect((await sharp(result.body).metadata()).width).toBe(DEVICE_IMAGE_SIZE);
  });

  it("rejects files that are not images", async () => {
    expect(await processDeviceImage(Buffer.from("<svg onload=alert(1)></svg>"))).toEqual({
      ok: false,
      error: "Images must be JPEG, PNG, WebP, GIF or AVIF.",
    });
  });

  it("rejects files over 5 MB before decoding them", async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024)]);
    expect(await processDeviceImage(big)).toEqual({ ok: false, error: "Each image must be 5 MB or smaller." });
  });

  it("rejects a corrupt image with a friendly message", async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    expect(await processDeviceImage(broken)).toEqual({ ok: false, error: "This image could not be read. Try another file." });
  });

  it("rejects images with too many pixels to decode safely", async () => {
    // A few bytes of PNG header claiming a 30000 x 30000 canvas: the classic decompression bomb
    expect(await processDeviceImage(pngHeader(30_000, 30_000))).toEqual({ ok: false, error: "This image is too large. Use one under 24 megapixels." });
  });
});
