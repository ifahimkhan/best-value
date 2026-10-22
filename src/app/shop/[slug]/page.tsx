import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { PriceTag } from "@/components/store/PriceTag";
import { ProductImage } from "@/components/store/ProductImage";
import { addToCartAction } from "@/app/cart/actions";
import { MAX_QTY } from "@/lib/store/cart";
import { CONDITION_LABELS } from "@/lib/store/listing";
import { getProduct } from "@/lib/store/queries";

async function ProductContent({ slug }: { slug: string }) {
  const product = await getProduct(slug);
  if (!product) notFound();
  const maxQty = Math.min(MAX_QTY, product.stock);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Shop", href: "/shop" },
          ...(product.categoryName && product.categorySlug
            ? [{ label: product.categoryName, href: `/shop?category=${product.categorySlug}` }]
            : []),
          { label: product.title },
        ]}
      />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <ProductImage src={product.images[0] ?? null} alt={product.title} sizes="(min-width: 768px) 32rem, 100vw" priority />
          {product.images.length > 1 && (
            <ul className="grid grid-cols-4 gap-2">
              {product.images.slice(1, 5).map((src) => (
                <li key={src}>
                  <ProductImage src={src} alt="" sizes="8rem" />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-brand">{CONDITION_LABELS[product.condition]}</p>
          <h1 className="mt-1 text-2xl font-bold">{product.title}</h1>
          <div className="mt-4">
            <PriceTag price={product.price} mrp={product.mrp} size="lg" />
            <p className="text-sm text-muted">Inclusive of GST. Free delivery.</p>
          </div>

          {product.stock > 0 ? (
            <form action={addToCartAction} className="mt-6 flex flex-wrap items-end gap-3">
              <input type="hidden" name="productId" value={product.id} />
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Quantity</span>
                <select name="qty" defaultValue="1" className="rounded-lg border border-border bg-surface px-3 py-2.5">
                  {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                name="intent"
                value="cart"
                className="rounded-lg border border-brand px-6 py-2.5 font-semibold text-brand hover:bg-brand-soft"
              >
                Add to cart
              </button>
              <button
                type="submit"
                name="intent"
                value="buy"
                className="rounded-lg bg-brand px-6 py-2.5 font-semibold text-brand-contrast hover:bg-brand-strong"
              >
                Buy now
              </button>
              {product.stock <= 3 && <p className="w-full text-sm text-danger">Only {product.stock} left</p>}
            </form>
          ) : (
            <p className="mt-6 font-semibold text-danger">Out of stock</p>
          )}

          {product.description && <p className="mt-8 whitespace-pre-line text-muted">{product.description}</p>}
          <dl className="mt-8 grid grid-cols-[8rem_1fr] gap-2 text-sm">
            {product.brandName && (
              <>
                <dt className="text-muted">Brand</dt>
                <dd>{product.brandName}</dd>
              </>
            )}
            <dt className="text-muted">SKU</dt>
            <dd>{product.sku}</dd>
            <dt className="text-muted">GST</dt>
            <dd>{product.gstRate}% included</dd>
          </dl>
        </div>
      </div>
    </>
  );
}

export default function ProductPage({ params }: PageProps<"/shop/[slug]">) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface" />}>
        {params.then(({ slug }) => (
          <ProductContent slug={slug} />
        ))}
      </Suspense>
    </section>
  );
}
