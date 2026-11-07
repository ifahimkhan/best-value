const AMAZON_SEARCH_URL = "https://www.amazon.in/s";

interface AmazonSearchInput {
  name: string;
  brandName: string;
  categoryName: string;
}

/** Amazon India search link for a catalog device, e.g. "10 Pro 5G OnePlus Smartphones". */
export function amazonSearchUrl({ name, brandName, categoryName }: AmazonSearchInput): string {
  const query = [name, brandName, categoryName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const url = new URL(AMAZON_SEARCH_URL);
  url.searchParams.set("k", query);
  return url.toString();
}
