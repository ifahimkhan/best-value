import Link from "next/link";
import { CONDITION_LABELS } from "@/lib/store/listing";
import type { ProductSummary } from "@/lib/store/schemas";
import { PriceTag } from "./PriceTag";
import { ProductImage } from "./ProductImage";

interface ProductGridProps {
  products: readonly ProductSummary[];
}

export function ProductGrid({ products }: ProductGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <li key={product.id}>
          <Link
            href={`/shop/${product.slug}`}
            className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-3 transition hover:border-brand hover:shadow-sm"
          >
            <ProductImage src={product.image} alt={product.title} sizes="(min-width: 1024px) 15rem, 45vw" />
            <span className="text-xs font-medium text-muted">{CONDITION_LABELS[product.condition]}</span>
            <span className="line-clamp-2 text-sm font-medium">{product.title}</span>
            <span className="mt-auto">
              <PriceTag price={product.price} mrp={product.mrp} />
              {!product.inStock && <span className="text-xs font-semibold text-danger">Out of stock</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
