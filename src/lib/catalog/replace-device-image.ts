import "server-only";
import { removeDeviceImage, setDeviceImage, uploadDeviceImage } from "./admin-devices";
import { processDeviceImage } from "./device-image";
import { applyImageToDeviceProducts, isImageUsedByProducts, type ApplyResult } from "./device-products";

export type ReplaceImageResult =
  | { ok: true; url: string; bytes: number; products: ApplyResult }
  | { ok: false; error: string };

const NOTHING_APPLIED: ApplyResult = { updated: 0, skippedFull: 0, failed: 0 };

export interface ReplaceImageOptions {
  /** Also show the photo on the shop products of every variant of the device. */
  applyToProducts?: boolean;
}

/**
 * Resize, upload once, point the device at the new photo, optionally share it
 * with the device's shop products, then delete the photo it replaced unless a
 * product still shows it. Caller checks admin access.
 */
export async function replaceDeviceImage(deviceId: number, input: Buffer, options: ReplaceImageOptions = {}): Promise<ReplaceImageResult> {
  const processed = await processDeviceImage(input);
  if (!processed.ok) return processed;

  let url: string;
  try {
    url = await uploadDeviceImage(deviceId, processed.body);
  } catch {
    return { ok: false, error: "The image could not be uploaded. Please try again." };
  }

  const saved = await setDeviceImage(deviceId, url);
  if (!saved.ok) {
    await removeDeviceImage(deviceId, url);
    return { ok: false, error: saved.error === "not_found" ? "This device no longer exists." : "The image could not be saved. Please try again." };
  }

  const products = options.applyToProducts ? await applyImageToDeviceProducts(deviceId, url) : NOTHING_APPLIED;
  if (saved.previous && !(await isImageUsedByProducts(saved.previous))) await removeDeviceImage(deviceId, saved.previous);
  return { ok: true, url, bytes: processed.body.length, products };
}
