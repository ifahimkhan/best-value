import type { SellStatus } from "./schemas";

export const SELL_STATUS_LABELS: Readonly<Record<SellStatus, string>> = {
  quoted: "Pickup booked",
  pickup_assigned: "Agent assigned",
  picked_up: "Device collected",
  inspected: "Inspection done",
  paid: "Paid",
  cancelled: "Cancelled",
};
