import "server-only";
import { removeDeviceImage, setDeviceImage, uploadDeviceImage } from "./admin-devices";
import { processDeviceImage } from "./device-image";

export type ReplaceImageResult = { ok: true; url: string; bytes: number } | { ok: false; error: string };

/** Resize, upload, point the device at the new photo, then delete the photo it replaced. Caller checks admin access. */
export async function replaceDeviceImage(deviceId: number, input: Buffer): Promise<ReplaceImageResult> {
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
  await removeDeviceImage(deviceId, saved.previous);
  return { ok: true, url, bytes: processed.body.length };
}
