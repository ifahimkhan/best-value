import { formatInr } from "@/lib/brand";

interface PriceTagProps {
  price: number;
  mrp: number | null;
  size?: "sm" | "lg";
}

export function PriceTag({ price, mrp, size = "sm" }: PriceTagProps) {
  const off = mrp ? Math.round(((mrp - price) / mrp) * 100) : 0;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className={size === "lg" ? "text-3xl font-bold" : "text-lg font-bold"}>{formatInr(price)}</span>
      {mrp && (
        <>
          <span className="text-sm text-muted line-through">{formatInr(mrp)}</span>
          {off > 0 && <span className="text-sm font-semibold text-brand">{off}% off</span>}
        </>
      )}
    </p>
  );
}
