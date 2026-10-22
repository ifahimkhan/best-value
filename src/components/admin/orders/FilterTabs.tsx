import Link from "next/link";

interface FilterTabsProps<T extends string> {
  basePath: string;
  options: readonly T[];
  labels: Readonly<Record<T, string>>;
  current: T;
}

/** Status filter links; the first option is the default and has no query string. */
export function FilterTabs<T extends string>({ basePath, options, labels, current }: FilterTabsProps<T>) {
  return (
    <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
      {options.map((option, i) => (
        <Link
          key={option}
          href={i === 0 ? basePath : `${basePath}?status=${option}`}
          aria-current={option === current ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${option === current ? "border-brand bg-brand-soft font-semibold" : "border-border"}`}
        >
          {labels[option]}
        </Link>
      ))}
    </nav>
  );
}

export function pickFilter<T extends string>(options: readonly T[], raw: string | string[] | undefined): T {
  return options.find((option) => option === raw) ?? options[0];
}
