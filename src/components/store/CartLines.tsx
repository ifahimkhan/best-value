import Link from "next/link";
import { removeFromCartAction, updateCartQtyAction } from "@/app/cart/actions";
import { formatInr } from "@/lib/brand";
import { MAX_QTY } from "@/lib/store/cart";
import type { LineProblem, PricedLine } from "@/lib/store/checkout";
import { toRupees } from "@/lib/store/gst";
import { ProductImage } from "./ProductImage";

const PROBLEM_TEXT: Readonly<Record<LineProblem, string>> = {
  unavailable: "No longer available. Please remove it.",
  out_of_stock: "Out of stock. Please remove it.",
  low_stock: "Not enough stock for this quantity.",
};

interface CartLinesProps {
  lines: readonly PricedLine[];
}

function QtyButton({ productId, qty, label }: { productId: string; qty: number; label: string }) {
  return (
    <form action={updateCartQtyAction}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="qty" value={qty} />
      <button type="submit" aria-label={label} className="size-8 rounded-md border border-border hover:border-brand">
        {label === "Decrease quantity" ? "−" : "+"}
      </button>
    </form>
  );
}

export function CartLines({ lines }: CartLinesProps) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {lines.map((line) => (
        <li key={line.productId} className="flex gap-4 p-4">
          <div className="w-20 shrink-0">
            <ProductImage src={line.product?.image ?? null} alt={line.product?.title ?? "Item"} sizes="5rem" />
          </div>
          <div className="flex-1">
            {line.product ? (
              <Link href={`/shop/${line.product.slug}`} className="font-medium hover:text-brand">
                {line.product.title}
              </Link>
            ) : (
              <p className="font-medium">Item no longer listed</p>
            )}
            {line.problem && <p className="text-sm text-danger">{PROBLEM_TEXT[line.problem]}</p>}
            <div className="mt-2 flex items-center gap-2">
              <QtyButton productId={line.productId} qty={line.qty - 1} label="Decrease quantity" />
              <span className="w-6 text-center">{line.qty}</span>
              {line.qty < MAX_QTY && <QtyButton productId={line.productId} qty={line.qty + 1} label="Increase quantity" />}
              <form action={removeFromCartAction} className="ml-3">
                <input type="hidden" name="productId" value={line.productId} />
                <button type="submit" className="text-sm text-muted underline hover:text-danger">
                  Remove
                </button>
              </form>
            </div>
          </div>
          <p className="font-semibold">{formatInr(toRupees(line.lineTotalPaise))}</p>
        </li>
      ))}
    </ul>
  );
}
