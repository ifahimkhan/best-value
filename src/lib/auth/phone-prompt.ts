export const PHONE_PROMPT_PATH = "/auth/phone";

export function phonePromptUrl(next: string): string {
  return `${PHONE_PROMPT_PATH}?next=${encodeURIComponent(next)}`;
}
