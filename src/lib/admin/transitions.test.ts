import { describe, expect, it } from "vitest";
import {
  dbErrorMessage,
  parseSellInternalForm,
  parseSellTransition,
  parseStoreTransition,
  SELL_NEXT,
  STORE_NEXT,
  storeActions,
} from "./transitions";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(entries).forEach(([key, value]) => data.append(key, value));
  return data;
}

describe("transition maps", () => {
  it("mirror the database rules", () => {
    expect(SELL_NEXT.quoted).toEqual(["pickup_assigned", "cancelled"]);
    expect(SELL_NEXT.paid).toEqual([]);
    expect(STORE_NEXT.shipped).toEqual(["delivered", "cancelled"]);
    expect(STORE_NEXT.refunded).toEqual([]);
  });
});

describe("parseSellTransition", () => {
  it("requires a final price for inspection", () => {
    expect(parseSellTransition(form({ toStatus: "inspected", finalPrice: "" }), "picked_up")).toEqual({
      ok: false,
      error: "Enter the final price agreed after inspection.",
    });
    expect(parseSellTransition(form({ toStatus: "inspected", finalPrice: "₹9,500" }), "picked_up")).toEqual({
      ok: true,
      update: { status: "inspected", final_price: 9500 },
    });
  });

  it("requires a payout reference to mark paid", () => {
    expect(parseSellTransition(form({ toStatus: "paid", payoutRef: " " }), "inspected")).toMatchObject({ ok: false });
    expect(parseSellTransition(form({ toStatus: "paid", payoutRef: " UTR 1234 " }), "inspected")).toEqual({
      ok: true,
      update: { status: "paid", payout_ref: "UTR 1234" },
    });
  });

  it("requires a reason to cancel and blocks steps the database would refuse", () => {
    expect(parseSellTransition(form({ toStatus: "cancelled", cancelReason: "" }), "quoted")).toMatchObject({ ok: false });
    expect(parseSellTransition(form({ toStatus: "cancelled", cancelReason: "Customer sold elsewhere" }), "quoted")).toEqual({
      ok: true,
      update: { status: "cancelled", cancel_reason: "Customer sold elsewhere" },
    });
    expect(parseSellTransition(form({ toStatus: "paid" }), "quoted")).toEqual({ ok: false, error: "That step is not allowed from the current status." });
  });

  it("lets staff correct the final price before payment", () => {
    expect(parseSellTransition(form({ toStatus: "inspected", finalPrice: "9000" }), "inspected")).toEqual({
      ok: true,
      update: { final_price: 9000 },
    });
  });
});

describe("parseStoreTransition", () => {
  it("requires tracking to ship", () => {
    expect(parseStoreTransition(form({ toStatus: "shipped", trackingNumber: "" }), "packed")).toMatchObject({ ok: false });
    expect(parseStoreTransition(form({ toStatus: "shipped", trackingCarrier: "Delhivery", trackingNumber: "DL-12345" }), "packed")).toEqual({
      ok: true,
      update: { status: "shipped", tracking_carrier: "Delhivery", tracking_number: "DL-12345" },
    });
    expect(parseStoreTransition(form({ toStatus: "shipped", trackingNumber: "bad number!" }), "packed")).toMatchObject({ ok: false });
  });

  it("refuses invalid steps", () => {
    expect(parseStoreTransition(form({ toStatus: "delivered" }), "paid")).toMatchObject({ ok: false });
    expect(parseStoreTransition(form({ toStatus: "packed" }), "paid")).toEqual({ ok: true, update: { status: "packed" } });
  });
});

describe("storeActions", () => {
  it("offers refunds only for captured payments", () => {
    expect(storeActions("cancelled", "captured")).toEqual(["refunded"]);
    expect(storeActions("cancelled", "pending")).toEqual([]);
    expect(storeActions("paid", "captured")).toEqual(["packed", "cancelled"]);
  });
});

describe("parseSellInternalForm", () => {
  it("accepts notes and an optional assignee", () => {
    const id = "6f1c1e3a-1b2c-4d5e-8f90-123456789abc";
    expect(parseSellInternalForm(form({ notes: " Call before 10am ", assignedTo: id }))).toEqual({
      ok: true,
      data: { staff_notes: "Call before 10am", assigned_to: id },
    });
    expect(parseSellInternalForm(form({ notes: "", assignedTo: "" }))).toEqual({ ok: true, data: { staff_notes: null, assigned_to: null } });
    expect(parseSellInternalForm(form({ notes: "x".repeat(2001), assignedTo: "" }))).toMatchObject({ ok: false });
  });
});

describe("dbErrorMessage", () => {
  it("translates trigger errors and hides unknown ones", () => {
    expect(dbErrorMessage("tracking_required")).toMatch(/tracking/i);
    expect(dbErrorMessage("refund_ref_locked")).toMatch(/refund/i);
    expect(dbErrorMessage("payout_ref_locked")).toMatch(/payout/i);
    expect(dbErrorMessage("permission denied for table orders")).toBe("The order could not be updated. Reload the page and try again.");
  });
});
