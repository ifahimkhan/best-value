import { MAX_QUERY_LENGTH } from "@/lib/catalog/search";

interface DeviceSearchBoxProps {
  placeholder?: string;
  defaultValue?: string;
}

// Plain GET form: works without JavaScript and gives shareable /search?q= URLs.
export function DeviceSearchBox({ placeholder = "Search your device", defaultValue }: DeviceSearchBoxProps) {
  return (
    <form action="/search" role="search" className="flex max-w-xl gap-2">
      <input
        name="q"
        type="search"
        defaultValue={defaultValue}
        maxLength={MAX_QUERY_LENGTH}
        placeholder={placeholder}
        aria-label="Search devices"
        className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 outline-none focus:border-brand"
      />
      <button type="submit" className="rounded-lg bg-brand px-5 font-semibold text-brand-contrast hover:bg-brand-strong">
        Search
      </button>
    </form>
  );
}
