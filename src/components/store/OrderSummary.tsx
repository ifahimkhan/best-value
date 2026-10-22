import { formatInr } from "@/lib/brand";
import { toRupees, type OrderTotals } from "@/lib/store/gst";

interface OrderSummaryProps {
  totals: OrderTotals;
  children?: React.ReactNode;
}

export function OrderSummary({ totals, children }: OrderSummaryProps) {
  return (
    <aside className="rounded-xl border border-border bg-surface p-5 lg:sticky lg:top-20">
      <h2 className="font-semibold">Order summary</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Price before GST</dt>
          <dd>{formatInr(toRupees(totals.taxable))}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">GST</dt>
          <dd>{formatInr(toRupees(totals.tax))}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Delivery</dt>
          <dd className="text-brand">Free</dd>
        </div>
      </dl>
      <div className="mt-4 flex justify-between border-t border-border pt-4 text-lg font-bold">
        <span>Total</span>
        <span>{formatInr(toRupees(totals.total))}</span>
      </div>
      {children}
    </aside>
  );
}
