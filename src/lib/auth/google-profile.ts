/** Name fields Google puts in Supabase `user_metadata`. All optional and untrusted. */
export type OAuthMetadata = Readonly<Record<string, unknown>> | null | undefined;

const MAX_NAME_LENGTH = 100;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** "First Last" from Google's given/family name, falling back to its display name. */
export function googleFullName(meta: OAuthMetadata): string | null {
  if (!meta) return null;
  const joined = [clean(meta.given_name), clean(meta.family_name)].filter(Boolean).join(" ");
  const name = joined || clean(meta.full_name) || clean(meta.name);
  return name ? name.slice(0, MAX_NAME_LENGTH) : null;
}
