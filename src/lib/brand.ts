export const BRAND = {
  name: "Best Value",
  tagline: "Sell your old devices for the best price. Buy great ones for less.",
  supportEmail: "support@bestvalue.example", // TODO: replace with real support inbox
  currency: "INR",
  locale: "en-IN",
  /** Browser chrome colour (matches --background) and accent for third-party widgets (matches --brand). */
  themeColor: "#0a0a0a",
  accentColor: "#c9a24a",
} as const;

const inrFormatter = new Intl.NumberFormat(BRAND.locale, {
  style: "currency",
  currency: BRAND.currency,
  maximumFractionDigits: 0,
});

export function formatInr(amount: number): string {
  return inrFormatter.format(amount);
}
