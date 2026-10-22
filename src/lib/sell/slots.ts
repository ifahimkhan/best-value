// Pickup scheduling rules. Dates are calendar days in India time (IST),
// whatever timezone the server runs in.

export const PICKUP_TIMEZONE = "Asia/Kolkata";
export const PICKUP_DAYS_AHEAD = 7;
export const PICKUP_SLOTS = ["10:00-13:00", "13:00-16:00", "16:00-19:00"] as const;
export type PickupSlot = (typeof PICKUP_SLOTS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// en-CA formats as YYYY-MM-DD
const istFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PICKUP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function istDateString(date: Date): string {
  return istFormatter.format(date);
}

/** Bookable pickup dates: tomorrow (IST) through PICKUP_DAYS_AHEAD days out. */
export function pickupDates(now: Date): string[] {
  const todayUtcMidnight = Date.parse(`${istDateString(now)}T00:00:00Z`);
  return Array.from({ length: PICKUP_DAYS_AHEAD }, (_, i) =>
    new Date(todayUtcMidnight + (i + 1) * DAY_MS).toISOString().slice(0, 10),
  );
}

export function isValidPickupDate(value: string, now: Date): boolean {
  return ISO_DATE.test(value) && pickupDates(now).includes(value);
}

export function isValidPickupSlot(value: string): value is PickupSlot {
  return (PICKUP_SLOTS as readonly string[]).includes(value);
}

/** "Fri, 23 Oct" for a YYYY-MM-DD date. */
export function formatPickupDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
