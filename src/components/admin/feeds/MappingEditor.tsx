"use client";

import { useActionState } from "react";
import { saveMappingAction, type MappingState } from "@/app/admin/suppliers/actions";
import { FIELD_KEYS, GST_RATES, PRODUCT_CONDITIONS, PRODUCT_FIELDS, type FeedMapping, type FieldKey } from "@/lib/feeds/mapping";
import { INPUT_CLASS } from "./SupplierForm";

interface MappingEditorProps {
  supplierId: number;
  columns: readonly string[];
  mapping: FeedMapping;
  suggested?: Partial<Record<FieldKey, string>>;
}

const INITIAL_STATE: MappingState = {};

const CONDITION_LABELS: Record<(typeof PRODUCT_CONDITIONS)[number], string> = {
  new: "New",
  refurbished_superb: "Refurbished: superb",
  refurbished_good: "Refurbished: good",
  refurbished_fair: "Refurbished: fair",
};

export function MappingEditor({ supplierId, columns, mapping, suggested = {} }: MappingEditorProps) {
  const [state, formAction, pending] = useActionState(saveMappingAction, INITIAL_STATE);
  const { options } = mapping;

  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-border bg-surface p-5">
      <input type="hidden" name="supplierId" value={supplierId} />
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Which column holds each product field?</legend>
        {FIELD_KEYS.map((key) => {
          const field = PRODUCT_FIELDS[key];
          const current = mapping.fields[key] ?? suggested[key] ?? "";
          // Keep a saved column selectable even when the latest preview no longer has it
          const choices = current && !columns.includes(current) ? [current, ...columns] : columns;
          return (
            <label key={key} className="block text-sm">
              <span className="mb-1 block font-medium">
                {field.label} {field.required && <span className="text-danger">*</span>}
              </span>
              <select name={`field.${key}`} defaultValue={current} className={INPUT_CLASS}>
                <option value="">Not in this feed</option>
                {choices.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Import options</legend>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Markup on supplier price (%)</span>
          <input name="markupPercent" type="number" min={0} max={300} step="0.1" defaultValue={options.markupPercent} className={INPUT_CLASS} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">GST rate when the feed has none</span>
          <select name="defaultGstRate" defaultValue={String(options.defaultGstRate)} className={INPUT_CLASS}>
            {GST_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}%
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Condition when the feed has none</span>
          <select name="defaultCondition" defaultValue={options.defaultCondition} className={INPUT_CLASS}>
            {PRODUCT_CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {CONDITION_LABELS[condition]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Products missing from the feed</span>
          <select name="missing" defaultValue={options.missing} className={INPUT_CLASS}>
            <option value="keep">Leave them as they are</option>
            <option value="zero_stock">Set their stock to 0</option>
          </select>
        </label>
      </fieldset>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-5 py-2 font-semibold text-brand-contrast disabled:opacity-60">
          {pending ? "Saving…" : "Save mapping"}
        </button>
        <p role="status" className="text-sm">
          {state.error && <span className="text-danger">{state.error}</span>}
          {state.saved && "Mapping saved."}
        </p>
      </div>
    </form>
  );
}
