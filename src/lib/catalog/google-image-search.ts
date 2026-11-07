const GOOGLE_SEARCH_URL = "https://www.google.com/search";

interface ImageSearchInput {
  name: string;
  brandName: string;
  categoryName: string;
}

/** Google Images search link for a catalog device, e.g. "10 Pro 5G OnePlus Smartphones". */
export function googleImageSearchUrl({ name, brandName, categoryName }: ImageSearchInput): string {
  const query = [name, brandName, categoryName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const url = new URL(GOOGLE_SEARCH_URL);
  url.searchParams.set("tbm", "isch");
  url.searchParams.set("q", query);
  return url.toString();
}
