import { describe, expect, it } from "vitest";
import { ORDER_STATUSES } from "./schemas";
import { ORDER_STATUS_LABELS } from "./status";

describe("ORDER_STATUS_LABELS", () => {
  it("labels every order status", () => {
    expect(Object.keys(ORDER_STATUS_LABELS).sort()).toEqual([...ORDER_STATUSES].sort());
    for (const status of ORDER_STATUSES) expect(ORDER_STATUS_LABELS[status]).toMatch(/\S/);
  });

  it("uses customer-facing wording for pending payment", () => {
    expect(ORDER_STATUS_LABELS.pending_payment).toBe("Awaiting payment");
  });
});
