import Link from "next/link";
import { formatInr } from "@/lib/brand";
import type { SellOrderSummary } from "@/lib/sell/schemas";
import { formatPickupDate } from "@/lib/sell/slots";
import { SELL_STATUS_LABELS } from "@/lib/sell/status";

interface SellOrderListProps {
  orders: readonly SellOrderSummary[];
}

export function SellOrderList({ orders }: SellOrderListProps) {
  if (orders.length === 0) {
    return (
      <p className="text-sm text-muted">
        No sell requests yet.{" "}
        <Link href="/sell" className="text-brand underline">
          Sell a device
        </Link>
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {orders.map((order) => (
        <li key={order.orderNo}>
          <Link href={`/account/sell/${order.orderNo}`} className="flex items-center justify-between gap-4 p-4 hover:bg-brand-soft">
            <span>
              <span className="block font-medium">{order.deviceName}</span>
              <span className="text-sm text-muted">
                {order.orderNo} · pickup {formatPickupDate(order.pickupDate)}
              </span>
            </span>
            <span className="text-right">
              <span className="block font-semibold">{formatInr(order.finalPrice ?? order.quotedPrice)}</span>
              <span className="text-sm text-muted">{SELL_STATUS_LABELS[order.status]}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
