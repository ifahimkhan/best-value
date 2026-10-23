"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { DEVICE_UPLOAD_MAX_BYTES, DEVICE_UPLOAD_TOO_BIG, parseDeviceId } from "@/lib/catalog/admin-device-list";
import { createDevice, setVariantPrices } from "@/lib/catalog/admin-device-write";
import { parseNewDeviceForm, parsePriceForm, type FormErrors } from "@/lib/catalog/device-form";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { replaceDeviceImage } from "@/lib/catalog/replace-device-image";
import { PRODUCTS_TAG } from "@/lib/store/queries";

// Every action re-checks admin access: the admin layout gate does not run for server actions.

export interface DeviceImageState {
  error?: string;
  done?: string;
  imageUrl?: string;
}

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

export async function uploadDeviceImageAction(_prev: DeviceImageState, form: FormData): Promise<DeviceImageState> {
  await requireAdmin();
  const deviceId = parseDeviceId(form.get("deviceId"));
  if (deviceId === null) return { error: "Unknown device." };
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  if (file.size > DEVICE_UPLOAD_MAX_BYTES) return { error: DEVICE_UPLOAD_TOO_BIG };

  const applyToProducts = form.get("applyToProducts") === "on";
  const result = await replaceDeviceImage(deviceId, Buffer.from(await file.arrayBuffer()), { applyToProducts });
  if (!result.ok) return { error: result.error };
  updateTag(CATALOG_TAG);
  const { updated, skippedFull, failed } = result.products;
  if (updated > 0) updateTag(PRODUCTS_TAG);
  const message = [
    `Saved (${(result.bytes / 1024).toFixed(1)} KB).`,
    updated > 0 && `Also showing on ${plural(updated, "shop product")}.`,
    skippedFull > 0 && `${plural(skippedFull, "shop product")} already had 8 photos and kept them.`,
    failed > 0 && "Some shop products could not be updated. Try again.",
  ]
    .filter(Boolean)
    .join(" ");
  return failed > 0 ? { error: message, imageUrl: result.url } : { done: message, imageUrl: result.url };
}

export interface NewDeviceState {
  error?: string;
  fieldErrors?: FormErrors;
}

const CHECK_FIELDS = "Please check the highlighted fields.";

async function savePhoto(deviceId: number, photo: File): Promise<boolean> {
  try {
    return (await replaceDeviceImage(deviceId, Buffer.from(await photo.arrayBuffer()))).ok;
  } catch {
    // Never leave the admin on the form for a device that was already created
    return false;
  }
}

export async function createDeviceAction(_prev: NewDeviceState, form: FormData): Promise<NewDeviceState> {
  await requireAdmin();
  const parsed = parseNewDeviceForm(form);
  if (!parsed.ok) return { error: CHECK_FIELDS, fieldErrors: parsed.errors };
  const photo = form.get("image");
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (hasPhoto && photo.size > DEVICE_UPLOAD_MAX_BYTES) return { error: CHECK_FIELDS, fieldErrors: { image: DEVICE_UPLOAD_TOO_BIG } };

  const created = await createDevice(parsed.data);
  if (!created.ok) {
    return created.error === "duplicate"
      ? { error: CHECK_FIELDS, fieldErrors: { name: "This brand already has this device in this category (names are compared by their web address)" } }
      : { error: "The device could not be added. Please try again." };
  }
  // The device exists now; a rejected photo leaves the placeholder and is reported on the next page
  const photoSaved = hasPhoto ? await savePhoto(created.id, photo) : true;
  updateTag(CATALOG_TAG);
  redirect(`/admin/catalog/${created.id}?created=1${photoSaved ? "" : "&photo=failed"}`);
}

export interface PriceFormState {
  error?: string;
  done?: string;
  fieldErrors?: FormErrors;
}

export async function saveVariantPricesAction(_prev: PriceFormState, form: FormData): Promise<PriceFormState> {
  await requireAdmin();
  const deviceId = parseDeviceId(form.get("deviceId"));
  if (deviceId === null) return { error: "Unknown device." };
  const parsed = parsePriceForm(form);
  if (!parsed.ok) {
    return Object.keys(parsed.errors).length > 0
      ? { error: "Please check the highlighted prices.", fieldErrors: parsed.errors }
      : { error: "There are no prices to save." };
  }

  const result = await setVariantPrices(deviceId, parsed.prices);
  if (!result.ok) return { error: "The prices could not be saved. Please try again." };
  if (result.updated === 0) return { error: "This device no longer has these variants. Reload the page." };
  updateTag(CATALOG_TAG);
  const saved = `Saved ${result.updated} ${result.updated === 1 ? "price" : "prices"}.`;
  return result.updated < parsed.prices.length
    ? { error: `${saved} Some variants were removed meanwhile. Reload the page.` }
    : { done: saved };
}
