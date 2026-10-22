"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
import { saveProductAction, type ProductFormState } from "@/app/admin/products/actions";
import { INPUT_CLASS } from "@/components/admin/feeds/SupplierForm";
import { LOCKABLE_FIELD_KEYS, LOCKABLE_FIELDS } from "@/lib/feeds/constants";
import { GST_RATES, MAX_IMAGES, PRODUCT_CONDITIONS } from "@/lib/feeds/mapping";
import type { AdminProduct, Option } from "@/lib/products/queries";
import { CONDITION_LABELS } from "@/lib/store/listing";
import { ImageManager } from "./ImageManager";

interface ProductFormProps {
  product?: AdminProduct;
  brands: Option[];
  categories: Option[];
}

const INITIAL_STATE: ProductFormState = {};
// Server Actions accept bodies up to 4.4 MB (next.config); leave room for the other fields
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-danger">{error}</span>}
    </label>
  );
}

function Select({ name, options, value, empty }: { name: string; options: Option[]; value: number | null | undefined; empty: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} className={INPUT_CLASS}>
      <option value="">{empty}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function ProductForm({ product, brands, categories }: ProductFormProps) {
  const [state, formAction, pending] = useActionState(saveProductAction, INITIAL_STATE);
  const [tooBig, setTooBig] = useState(false);
  const e = tooBig ? { images: "New images add up to more than 4 MB. Save them in smaller groups." } : (state.fieldErrors ?? {});
  const input = (name: string) => ({ name, "aria-invalid": Boolean(e[name]), className: INPUT_CLASS });

  // Submitting by hand keeps the typed values when the server reports errors
  // (React resets uncontrolled forms after a form action)
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const uploadBytes = data.getAll("newImages").reduce((sum, f) => sum + (f instanceof File ? f.size : 0), 0);
    if (uploadBytes > MAX_UPLOAD_BYTES) {
      setTooBig(true);
      return;
    }
    setTooBig(false);
    startTransition(() => formAction(data));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-xl border border-border bg-surface p-5">
      {product && <input type="hidden" name="productId" value={product.id} />}
      {product && <input type="hidden" name="loadedAt" value={product.updated_at} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title" error={e.title}>
            <input {...input("title")} required maxLength={200} defaultValue={product?.title} />
          </Field>
        </div>
        <Field label="SKU" error={e.sku} hint="Your own stock code, e.g. BV-IP13-128-GD">
          <input {...input("sku")} required maxLength={64} defaultValue={product?.sku} />
        </Field>
        <Field label="URL name" error={e.slug} hint="Leave empty to build it from the title">
          <input {...input("slug")} maxLength={120} defaultValue={product?.slug} />
        </Field>
        <Field label="Category" error={e.categoryId}>
          <Select name="categoryId" options={categories} value={product?.category_id} empty="No category" />
        </Field>
        <Field label="Brand" error={e.brandId}>
          <Select name="brandId" options={brands} value={product?.brand_id} empty="No brand" />
        </Field>
        <Field label="Condition" error={e.condition}>
          <select name="condition" defaultValue={product?.condition ?? "new"} className={INPUT_CLASS}>
            {PRODUCT_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stock" error={e.stock}>
          <input {...input("stock")} required inputMode="numeric" defaultValue={product?.stock ?? 0} />
        </Field>
        <Field label="Selling price, incl. GST (₹)" error={e.price}>
          <input {...input("price")} required inputMode="decimal" defaultValue={product?.price} />
        </Field>
        <Field label="MRP (₹)" error={e.mrp} hint="Optional. Shown struck through when higher than the price">
          <input {...input("mrp")} inputMode="decimal" defaultValue={product?.mrp ?? ""} />
        </Field>
        <Field label="GST rate" error={e.gstRate}>
          <select name="gstRate" defaultValue={String(product?.gst_rate ?? 18)} className={INPUT_CLASS}>
            {GST_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}%
              </option>
            ))}
          </select>
        </Field>
        <Field label="HSN code" error={e.hsnCode} hint="Optional. 8517 for phones">
          <input {...input("hsnCode")} inputMode="numeric" maxLength={8} defaultValue={product?.hsn_code ?? ""} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description" error={e.description}>
            <textarea {...input("description")} rows={6} maxLength={5000} defaultValue={product?.description ?? ""} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={product?.is_active ?? true} />
          Show in the store
        </label>
      </div>

      <ImageManager initial={product?.images ?? []} max={MAX_IMAGES} error={e.images} />

      {product?.source === "feed" && (
        <fieldset>
          <legend className="mb-1 font-semibold">Protect from feed updates</legend>
          <p className="mb-3 text-sm text-muted">
            Ticked fields keep your values when {product.supplier?.name ?? "the supplier"} sends a new feed. Fields you edit here are ticked
            automatically.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {LOCKABLE_FIELD_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="lock" value={key} defaultChecked={product.locked_fields.includes(key)} />
                {LOCKABLE_FIELDS[key]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-5 py-2 font-semibold text-brand-contrast disabled:opacity-60">
          {pending ? "Saving…" : product ? "Save changes" : "Create product"}
        </button>
        <p role="status" className="text-sm">
          {state.error && <span className="text-danger">{state.error}</span>}
        </p>
      </div>
    </form>
  );
}
