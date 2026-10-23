"use server";

import { updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { DEVICE_UPLOAD_MAX_BYTES, DEVICE_UPLOAD_TOO_BIG, parseDeviceId } from "@/lib/catalog/admin-device-list";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { replaceDeviceImage } from "@/lib/catalog/replace-device-image";

export interface DeviceImageState {
  error?: string;
  done?: string;
  imageUrl?: string;
}

// Re-checks admin access: the admin layout gate does not run for server actions.
export async function uploadDeviceImageAction(_prev: DeviceImageState, form: FormData): Promise<DeviceImageState> {
  await requireAdmin();
  const deviceId = parseDeviceId(form.get("deviceId"));
  if (deviceId === null) return { error: "Unknown device." };
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  if (file.size > DEVICE_UPLOAD_MAX_BYTES) return { error: DEVICE_UPLOAD_TOO_BIG };

  const result = await replaceDeviceImage(deviceId, Buffer.from(await file.arrayBuffer()));
  if (!result.ok) return { error: result.error };
  updateTag(CATALOG_TAG);
  return { done: `Saved (${(result.bytes / 1024).toFixed(1)} KB).`, imageUrl: result.url };
}
