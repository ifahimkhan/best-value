import sharp, { type OutputInfo } from "sharp";
import { validateImageFile } from "@/lib/products/image-file";

// Device photos on the sell flow are small square tiles, so every upload is
// normalised to one 192x192 WebP of at most 20 KB, whatever the staff member picked.
export const DEVICE_IMAGE_SIZE = 192;
export const DEVICE_IMAGE_MAX_BYTES = 20 * 1024;
// Far more than a 192px tile needs, and keeps a PNG decode to roughly 100 MB of memory
const MAX_INPUT_PIXELS = 24_000_000;
const QUALITY_STEPS = [82, 72, 62, 52, 42, 32, 22] as const;

export type DeviceImageResult = { ok: true; body: Buffer; contentType: "image/webp" } | { ok: false; error: string };

const fail = (error: string): DeviceImageResult => ({ ok: false, error });

async function squareRaw(input: Buffer): Promise<{ data: Buffer; info: OutputInfo } | null> {
  try {
    // rotate() applies EXIF orientation; metadata (EXIF, GPS) is dropped on output by default
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      .rotate()
      .resize(DEVICE_IMAGE_SIZE, DEVICE_IMAGE_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    return null;
  }
}

/** Validates an uploaded image and converts it to a small square WebP for the device catalog. */
export async function processDeviceImage(input: Buffer): Promise<DeviceImageResult> {
  const check = validateImageFile(input);
  if (!check.ok) return fail(check.error);

  try {
    const { width = 0, height = 0 } = await sharp(input, { limitInputPixels: false }).metadata();
    if (width * height > MAX_INPUT_PIXELS) return fail("This image is too large. Use one under 24 megapixels.");
  } catch {
    return fail("This image could not be read. Try another file.");
  }

  const square = await squareRaw(input);
  if (!square) return fail("This image could not be read. Try another file.");
  const { data, info } = square;

  try {
    for (const quality of QUALITY_STEPS) {
      const body = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .webp({ quality, alphaQuality: quality, effort: 6 })
        .toBuffer();
      if (body.length <= DEVICE_IMAGE_MAX_BYTES) return { ok: true, body, contentType: "image/webp" };
    }
  } catch {
    return fail("This image could not be converted. Try another file.");
  }
  return fail("This image has too much detail to fit in 20 KB. Try a simpler photo on a plain background.");
}
