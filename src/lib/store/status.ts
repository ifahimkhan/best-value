import type { OrderStatus } from "./schemas";

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};
