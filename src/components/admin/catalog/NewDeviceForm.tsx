"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
import { createDeviceAction, type NewDeviceState } from "@/app/admin/catalog/actions";
import { INPUT_CLASS } from "@/components/admin/feeds/SupplierForm";
import { DEVICE_UPLOAD_MAX_BYTES, DEVICE_UPLOAD_TOO_BIG } from "@/lib/catalog/admin-device-list";
import { MAX_VARIANTS, type FormErrors } from "@/lib/catalog/device-form";

interface Option {
  name: string;
  slug: string;
}

interface NewDeviceFormProps {
  categories: Option[];
  brands: Option[];
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
const SMALL_BUTTON = "rounded border border-border px-3 py-1 text-xs hover:bg-brand-soft disabled:opacity-40";

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

function OptionSelect({ name, options, empty, invalid }: { name: string; options: Option[]; empty: string; invalid: boolean }) {
  return (
    <select name={name} required defaultValue="" aria-invalid={invalid} className={INPUT_CLASS}>
      <option value="">{empty}</option>
      {options.map((o) => (
        <option key={o.slug} value={o.slug}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

/** Add a newly released device with its RAM/storage variants and buy prices. */
export function NewDeviceForm({ categories, brands }: NewDeviceFormProps) {
  const [state, run, pending] = useActionState<NewDeviceState, FormData>(createDeviceAction, {});
  const [rows, setRows] = useState<number[]>([0]);
  const [nextRow, setNextRow] = useState(1);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Row errors refer to row positions at the last submit; hide them once rows are added or removed
  const [submittedRows, setSubmittedRows] = useState<number[]>(rows);
  const rowErrorsCurrent = submittedRows === rows;
  const e: FormErrors = { ...(state.fieldErrors ?? {}), ...(photoError ? { image: photoError } : {}) };

  const addRow = (): void => {
    setRows([...rows, nextRow]);
    setNextRow(nextRow + 1);
  };

  // Submitting by hand keeps the typed values when the server reports errors
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (photoError) return;
    const data = new FormData(event.currentTarget);
    setSubmittedRows(rows);
    startTransition(() => run(data));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-xl border border-border bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={e.category}>
          <OptionSelect name="category" options={categories} empty="Choose a category" invalid={Boolean(e.category)} />
        </Field>
        <Field label="Brand" error={e.brand}>
          <OptionSelect name="brand" options={brands} empty="Choose a brand" invalid={Boolean(e.brand)} />
        </Field>
        <Field label="Device name" error={e.name} hint="As customers know it, e.g. Galaxy S26 Ultra">
          <input name="name" required maxLength={120} aria-invalid={Boolean(e.name)} className={INPUT_CLASS} />
        </Field>
        <Field label="Release year" error={e.releaseYear} hint="Optional">
          <input name="releaseYear" inputMode="numeric" pattern="\d{4}" maxLength={4} aria-invalid={Boolean(e.releaseYear)} className={INPUT_CLASS} />
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-1 font-semibold">Variants and buy prices</legend>
        <p className="text-xs text-muted">
          One row per RAM and storage option, with the price you pay for one in perfect condition. Leave RAM and storage empty for devices
          without memory sizes, such as TVs or earbuds.
        </p>
        {e.variants && <p className="text-sm text-danger">{e.variants}</p>}
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li key={row} className="space-y-1">
              <div className="grid grid-cols-[1fr_1fr_1.4fr_auto] items-end gap-2">
                <Field label={index === 0 ? "RAM (GB)" : ""}>
                  <input name="variantRam" inputMode="numeric" placeholder="8" aria-label={`Variant ${index + 1} RAM in GB`} className={INPUT_CLASS} />
                </Field>
                <Field label={index === 0 ? "Storage (GB)" : ""}>
                  <input
                    name="variantStorage"
                    inputMode="numeric"
                    placeholder="256"
                    aria-label={`Variant ${index + 1} storage in GB`}
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field label={index === 0 ? "Buy price (₹)" : ""}>
                  <input
                    name="variantPrice"
                    inputMode="decimal"
                    placeholder="45000"
                    aria-label={`Variant ${index + 1} buy price in rupees`}
                    className={INPUT_CLASS}
                  />
                </Field>
                <button
                  type="button"
                  className={`${SMALL_BUTTON} mb-1.5`}
                  onClick={() => setRows(rows.filter((r) => r !== row))}
                  disabled={rows.length === 1}
                  aria-label={`Remove variant ${index + 1}`}
                >
                  Remove
                </button>
              </div>
              {rowErrorsCurrent && e[`variant-${index}`] && <p className="text-sm text-danger">{e[`variant-${index}`]}</p>}
            </li>
          ))}
        </ul>
        <button type="button" className={SMALL_BUTTON} onClick={addRow} disabled={rows.length >= MAX_VARIANTS}>
          Add variant
        </button>
        <p className="text-xs text-muted">1 TB = 1024 GB.</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Photo" error={e.image} hint="Optional. Fitted into 192 × 192 and compressed to 20 KB or less. The category placeholder is used until you add one.">
          <input
            type="file"
            name="image"
            accept={ACCEPT}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              setPhotoError(file && file.size > DEVICE_UPLOAD_MAX_BYTES ? DEVICE_UPLOAD_TOO_BIG : null);
            }}
            className="block text-sm"
          />
        </Field>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isActive" defaultChecked /> Show on the site now
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isTopSelling" /> List under top selling
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-5 py-2 font-semibold text-brand-contrast disabled:opacity-60">
          {pending ? "Adding…" : "Add device"}
        </button>
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
