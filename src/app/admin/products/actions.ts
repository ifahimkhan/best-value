"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { MAX_IMAGES } from "@/lib/feeds/mapping";
import { lockedFieldsAfterEdit, parseProductForm, type ProductInput } from "@/lib/products/form";
import { validateImageFile } from "@/lib/products/image-file";
import {
  deleteProduct,
  getAdminProduct,
  imagePrefix,
  insertProduct,
  removeUploadedImages,
  updateProduct,
  uploadProductImages,
  UUID_PATTERN,
  type AdminProduct,
  type WriteResult,
} from "@/lib/products/queries";
import { PRODUCTS_TAG } from "@/lib/store/queries";

// Every action re-checks staff access: the admin layout gate does not run for server actions.

export interface ProductFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const WRITE_ERRORS: Record<Exclude<WriteResult, { ok: true }>["error"], ProductFormState> = {
  duplicate_sku: { error: "Please check the highlighted fields.", fieldErrors: { sku: "Another product already uses this SKU" } },
  duplicate_slug: { error: "Please check the highlighted fields.", fieldErrors: { slug: "Another product already uses this URL" } },
  stale: { error: "This product was changed elsewhere (by staff or a feed import) since you opened it. Reload the page and make your edit again." },
  error: { error: "The product could not be saved. Please try again." },
};

type PreparedImages = { ok: true; files: { body: Buffer; contentType: string; extension: string }[] } | { ok: false; error: string };

async function readNewImages(form: FormData, room: number): Promise<PreparedImages> {
  const files = form.getAll("newImages").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > room) return { ok: false, error: `A product can have at most ${MAX_IMAGES} images.` };
  const prepared = [];
  for (const file of files) {
    const body = Buffer.from(await file.arrayBuffer());
    const check = validateImageFile(body);
    if (!check.ok) return { ok: false, error: `${file.name.slice(0, 60)}: ${check.error}` };
    prepared.push({ body, contentType: check.contentType, extension: check.extension });
  }
  return { ok: true, files: prepared };
}

function lockSnapshot(p: AdminProduct | ProductInput) {
  const { title, description, condition, brand_id, category_id, mrp, price, gst_rate, hsn_code, stock, images, is_active } = p;
  return { title, description, condition, brand_id, category_id, mrp, price, gst_rate, hsn_code, stock, images, is_active };
}

export async function saveProductAction(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  await requireStaff();
  const rawId = form.get("productId");
  const existing = typeof rawId === "string" && rawId !== "" ? await getAdminProduct(rawId) : null;
  if (rawId && !existing) return { error: "This product no longer exists." };

  const parsed = parseProductForm(form, imagePrefix());
  if (!parsed.ok) return { error: "Please check the highlighted fields.", fieldErrors: parsed.errors };
  const images = await readNewImages(form, MAX_IMAGES - parsed.data.images.length);
  if (!images.ok) return { error: images.error, fieldErrors: { images: images.error } };

  let uploaded: string[] = [];
  try {
    uploaded = await uploadProductImages(images.files);
  } catch {
    return { error: "The images could not be uploaded. Please try again." };
  }
  const draft: ProductInput = { ...parsed.data, images: [...parsed.data.images, ...uploaded] };
  const input: ProductInput = existing
    ? {
        ...draft,
        locked_fields: lockedFieldsAfterEdit({
          source: existing.source,
          before: lockSnapshot(existing),
          after: lockSnapshot(draft),
          requested: draft.locked_fields,
        }),
      }
    : { ...draft, locked_fields: [] };

  const loadedAt = form.get("loadedAt");
  const result = existing
    ? await updateProduct(existing.id, input, typeof loadedAt === "string" ? loadedAt : "")
    : await insertProduct(input);
  if (!result.ok) {
    await removeUploadedImages(uploaded);
    return WRITE_ERRORS[result.error];
  }
  if (existing) await removeUploadedImages(existing.images.filter((url) => !input.images.includes(url)));
  updateTag(PRODUCTS_TAG);
  redirect(`/admin/products/${result.id}?${existing ? "saved" : "created"}=1`);
}

export interface DeleteState {
  error?: string;
}

export async function deleteProductAction(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  await requireStaff();
  const id = form.get("productId");
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return { error: "Unknown product." };
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm." };
  const images = await deleteProduct(id);
  if (!images) return { error: "The product could not be deleted. Please try again." };
  await removeUploadedImages(images);
  updateTag(PRODUCTS_TAG);
  redirect("/admin/products?deleted=1");
}
