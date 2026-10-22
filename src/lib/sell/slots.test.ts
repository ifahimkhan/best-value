import { describe, expect, it } from "vitest";
import { istDateString, isValidPickupDate, isValidPickupSlot, pickupDates, PICKUP_DAYS_AHEAD } from "./slots";

// 22 Oct 2026, 20:00 UTC = 23 Oct 2026, 01:30 IST
const LATE_UTC = new Date("2026-10-22T20:00:00Z");
// 22 Oct 2026, 06:00 UTC = 22 Oct 2026, 11:30 IST
const MORNING_UTC = new Date("2026-10-22T06:00:00Z");

describe("istDateString", () => {
  it("formats the date in India time", () => {
    expect(istDateString(MORNING_UTC)).toBe("2026-10-22");
    expect(istDateString(LATE_UTC)).toBe("2026-10-23");
  });
});

describe("pickupDates", () => {
  it("starts tomorrow in India time and covers the booking window", () => {
    const dates = pickupDates(MORNING_UTC);
    expect(dates).toHaveLength(PICKUP_DAYS_AHEAD);
    expect(dates[0]).toBe("2026-10-23");
    expect(dates.at(-1)).toBe("2026-10-29");
  });

  it("crosses month ends", () => {
    const dates = pickupDates(new Date("2026-10-30T06:00:00Z"));
    expect(dates.slice(0, 3)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("uses the India date even when UTC is still the previous day", () => {
    expect(pickupDates(LATE_UTC)[0]).toBe("2026-10-24");
  });
});

describe("isValidPickupDate", () => {
  it("accepts dates inside the window", () => {
    expect(isValidPickupDate("2026-10-23", MORNING_UTC)).toBe(true);
    expect(isValidPickupDate("2026-10-29", MORNING_UTC)).toBe(true);
  });

  it("rejects today, past, too-far and malformed dates", () => {
    expect(isValidPickupDate("2026-10-22", MORNING_UTC)).toBe(false);
    expect(isValidPickupDate("2026-10-30", MORNING_UTC)).toBe(false);
    expect(isValidPickupDate("23-10-2026", MORNING_UTC)).toBe(false);
  });
});

describe("isValidPickupSlot", () => {
  it("only accepts known slots", () => {
    expect(isValidPickupSlot("10:00-13:00")).toBe(true);
    expect(isValidPickupSlot("02:00-05:00")).toBe(false);
  });
});
