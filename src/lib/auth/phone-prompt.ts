/** Set once a user saved or skipped the optional mobile-number step, so we ask only once per browser. */
export const PHONE_PROMPT_COOKIE = "bv_phone_prompt";
export const PHONE_PROMPT_PATH = "/auth/phone";

export function phonePromptUrl(next: string): string {
  return `${PHONE_PROMPT_PATH}?next=${encodeURIComponent(next)}`;
}
