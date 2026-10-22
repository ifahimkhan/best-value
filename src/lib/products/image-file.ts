export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

type ImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/avif";

const EXTENSIONS: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

const startsWith = (data: Buffer, signature: readonly number[]): boolean =>
  data.length >= signature.length && signature.every((byte, i) => data[i] === byte);

const ascii = (data: Buffer, start: number, end: number): string => data.subarray(start, end).toString("latin1");

/** Identifies an image by its first bytes. The browser-declared type is never trusted. SVG is not accepted. */
export function sniffImageType(data: Buffer): ImageType | null {
  if (startsWith(data, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (["GIF87a", "GIF89a"].includes(ascii(data, 0, 6))) return "image/gif";
  if (ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 12) === "WEBP") return "image/webp";
  if (ascii(data, 4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(data, 8, 12))) return "image/avif";
  return null;
}

export type ImageFileCheck = { ok: true; contentType: ImageType; extension: string } | { ok: false; error: string };

export function validateImageFile(data: Buffer): ImageFileCheck {
  if (data.length > MAX_PRODUCT_IMAGE_BYTES) return { ok: false, error: "Each image must be 5 MB or smaller." };
  const type = sniffImageType(data);
  if (!type) return { ok: false, error: "Images must be JPEG, PNG, WebP, GIF or AVIF." };
  return { ok: true, contentType: type, extension: EXTENSIONS[type] };
}
