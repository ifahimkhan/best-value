"use client";

import Link from "next/link";
import { useState } from "react";
import { formatInr } from "@/lib/brand";
import type { Variant } from "@/lib/catalog/schemas";

interface VariantPickerProps {
  variants: readonly Variant[];
}

export function VariantPicker({ variants }: VariantPickerProps) {
  // Preselect when there is only one option
  const [selectedId, setSelectedId] = useState<number | null>(variants.length === 1 ? variants[0].id : null);
  const selected = variants.find((v) => v.id === selectedId) ?? null;

  if (variants.length === 0) {
    return <p className="text-muted">We&apos;re not buying this model right now.</p>;
  }

  return (
    <fieldset>
      <legend className="mb-3 font-semibold">Choose your variant</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {variants.map((variant) => {
          const isSelected = variant.id === selectedId;
          return (
            <label
              key={variant.id}
              className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition ${
                isSelected ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-brand"
              }`}
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="variant"
                  value={variant.id}
                  checked={isSelected}
                  onChange={() => setSelectedId(variant.id)}
                  className="accent-brand"
                />
                <span className="font-medium">{variant.label}</span>
              </span>
              <span className="text-sm text-muted">up to {formatInr(variant.price)}</span>
            </label>
          );
        })}
      </div>

      {selected ? (
        <Link
          href={selected.href}
          className="mt-6 inline-block rounded-lg bg-brand px-6 py-3 font-semibold text-brand-contrast hover:bg-brand-strong"
        >
          Get exact price
        </Link>
      ) : (
        <p className="mt-6 text-sm text-muted">Select a variant to see your exact price.</p>
      )}
    </fieldset>
  );
}
