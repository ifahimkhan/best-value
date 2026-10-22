import Link from "next/link";
import { formatInr } from "@/lib/brand";
import type { StoreOrderSummary } from "@/lib/store/schemas";
import { ORDER_STATUS_LABELS } from "@/lib/store/status";

interface StoreOrderListProps {
  orders: readonly StoreOrderSummary[];
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export function StoreOrderList({ orders }: StoreOrderListProps) {
  if (orders.length === 0) {
    return (
      <p className="text-sm text-muted">
        No orders yet.{" "}
        <Link href="/shop" className="text-brand underline">
          Browse the shop
        </Link>
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {orders.map((order) => (
        <li key={order.orderNo}>
          <Link href={`/account/orders/${order.orderNo}`} className="flex items-center justify-between gap-4 p-4 hover:bg-brand-soft">
            <span>
              <span className="block font-medium">{order.items[0]?.title ?? "Order"}{order.items.length > 1 && ` + ${order.items.length - 1} more`}</span>
              <span className="text-sm text-muted">
                {order.orderNo} · {dateFormatter.format(new Date(order.createdAt))}
              </span>
            </span>
            <span className="text-right">
              <span className="block font-semibold">{formatInr(order.total)}</span>
              <span className="text-sm text-muted">{ORDER_STATUS_LABELS[order.status]}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
