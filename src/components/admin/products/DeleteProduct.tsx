"use client";

import { useActionState } from "react";
import { deleteProductAction, type DeleteState } from "@/app/admin/products/actions";

const INITIAL_STATE: DeleteState = {};

/** Delete with an explicit confirm tick instead of a browser dialog. */
export function DeleteProduct({ productId, fromFeed }: { productId: string; fromFeed: boolean }) {
  const [state, formAction, pending] = useActionState(deleteProductAction, INITIAL_STATE);
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-danger p-5">
      <input type="hidden" name="productId" value={productId} />
      <h2 className="font-semibold">Delete product</h2>
      <p className="text-sm text-muted">
        Past orders keep their own copy of the item.{" "}
        {fromFeed
          ? "This product comes from a supplier feed and will be created again on the next import; untick “Show in the store” instead to hide it."
          : "To hide it for now, untick “Show in the store” instead."}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" required />
        Yes, delete this product
      </label>
      <button type="submit" disabled={pending} className="rounded-lg border border-danger px-5 py-2 font-semibold text-danger disabled:opacity-60">
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
