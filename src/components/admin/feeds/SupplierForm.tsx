"use client";

import { useActionState } from "react";
import { createSupplierAction, updateSupplierAction, type SupplierFormState } from "@/app/admin/suppliers/actions";
import { FEED_FORMATS } from "@/lib/feeds/constants";
import type { Supplier } from "@/lib/feeds/suppliers";

interface SupplierFormProps {
  supplier?: Supplier;
}

const INITIAL_STATE: SupplierFormState = {};
export const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-brand aria-[invalid=true]:border-danger";

const FORMAT_LABELS: Record<(typeof FEED_FORMATS)[number], string> = {
  csv: "CSV",
  xlsx: "Excel (.xlsx)",
  json: "JSON",
  xml: "XML",
};

export function SupplierForm({ supplier }: SupplierFormProps) {
  const [state, formAction, pending] = useActionState(supplier ? updateSupplierAction : createSupplierAction, INITIAL_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
      {supplier && <input type="hidden" name="supplierId" value={supplier.id} />}
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Supplier name</span>
        <input name="name" required maxLength={120} defaultValue={supplier?.name} aria-invalid={Boolean(errors.name)} className={INPUT_CLASS} />
        {errors.name && <span className="mt-1 block text-sm text-danger">{errors.name}</span>}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">File format</span>
        <select name="feedFormat" defaultValue={supplier?.feedFormat ?? "csv"} className={INPUT_CLASS}>
          {FEED_FORMATS.map((format) => (
            <option key={format} value={format}>
              {FORMAT_LABELS[format]}
            </option>
          ))}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-sm font-medium">
          Feed URL <span className="font-normal text-muted">(optional, https only)</span>
        </span>
        <input
          name="feedUrl"
          type="url"
          inputMode="url"
          defaultValue={supplier?.feedUrl ?? ""}
          placeholder="https://supplier.example.com/products.csv"
          aria-invalid={Boolean(errors.feedUrl)}
          className={INPUT_CLASS}
        />
        {errors.feedUrl && <span className="mt-1 block text-sm text-danger">{errors.feedUrl}</span>}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="scheduled" defaultChecked={supplier?.scheduled ?? false} />
        Import automatically every day
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={supplier?.isActive ?? true} />
        Supplier active
      </label>
      {errors.scheduled && <p className="text-sm text-danger sm:col-span-2">{errors.scheduled}</p>}
      <div className="flex items-center gap-4 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-5 py-2 font-semibold text-brand-contrast disabled:opacity-60">
          {pending ? "Saving…" : supplier ? "Save settings" : "Add supplier"}
        </button>
        <p role="status" className="text-sm">
          {state.error && <span className="text-danger">{state.error}</span>}
          {state.saved && "Saved."}
        </p>
      </div>
    </form>
  );
}
