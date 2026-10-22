import { describe, expect, it } from "vitest";
import { SELL_STATUS_LABELS } from "./status";

describe("SELL_STATUS_LABELS", () => {
  it("has a customer-facing label for every sell status", () => {
    expect(SELL_STATUS_LABELS).toEqual({
      quoted: "Pickup booked",
      pickup_assigned: "Agent assigned",
      picked_up: "Device collected",
      inspected: "Inspection done",
      paid: "Paid",
      cancelled: "Cancelled",
    });
  });
});
