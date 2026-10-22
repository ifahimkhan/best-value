import type { Answers } from "@/lib/sell/pricing";

// Calculator answers are kept in sessionStorage so they survive the trip to
// /login and back. Storage can be blocked (private mode), so every access is
// guarded and the calculator works without it.

const PREFIX = "bv:sell:";
const storageKey = (variantId: number) => `${PREFIX}${variantId}`;

function isAnswers(value: unknown): value is Answers {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, ids]) => /^\d+$/.test(key) && Array.isArray(ids) && ids.every((id) => Number.isSafeInteger(id) && id > 0),
    )
  );
}

export function readSavedRaw(variantId: number): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(variantId));
  } catch {
    return null;
  }
}

export function parseSavedAnswers(raw: string | null): Answers | null {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isAnswers(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAnswers(variantId: number, answers: Answers): void {
  try {
    window.sessionStorage.setItem(storageKey(variantId), JSON.stringify(answers));
  } catch {
    // Storage blocked: answers just won't survive a reload
  }
}

/** Called once a booking succeeds, so the next visit starts fresh. */
export function clearAllSavedAnswers(): void {
  try {
    const keys = Array.from({ length: window.sessionStorage.length }, (_, i) => window.sessionStorage.key(i));
    keys.filter((k): k is string => k?.startsWith(PREFIX) ?? false).forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    // Nothing to clear when storage is blocked
  }
}
