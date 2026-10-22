import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DeleteProduct } from "@/components/admin/products/DeleteProduct";
import { ProductForm } from "@/components/admin/products/ProductForm";
import { requireStaff } from "@/lib/auth/session";
import { getAdminProduct, listProductOptions } from "@/lib/products/queries";

export const metadata = { title: "Edit product", robots: { index: false } };

async function EditProduct({ id, notice }: { id: string; notice: string | null }) {
  await requireStaff();
  const [product, { brands, categories }] = await Promise.all([getAdminProduct(id), listProductOptions()]);
  if (!product) notFound();
  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/products" className="text-sm text-brand underline">
          All products
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{product.title}</h1>
        <p className="text-sm text-muted">
          {product.source === "feed"
            ? `From ${product.supplier?.name ?? "a supplier feed"}, supplier SKU ${product.supplier_sku ?? "unknown"}`
            : "Added by hand"}
          {product.is_active && (
            <>
              {" · "}
              <Link href={`/shop/${product.slug}`} className="text-brand underline">
                View in store
              </Link>
            </>
          )}
        </p>
      </div>
      {notice && (
        <p role="status" className="rounded-lg bg-brand-soft p-3 text-sm">
          {notice}
        </p>
      )}
      {/* Remount after each save so the form shows what was stored */}
      <ProductForm key={product.updated_at} product={product} brands={brands} categories={categories} />
      <DeleteProduct productId={product.id} fromFeed={product.source === "feed"} />
    </div>
  );
}

export default function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface" />}>
      {Promise.all([params, searchParams]).then(([{ id }, query]) => (
        <EditProduct id={id} notice={query.created === "1" ? "Product created." : query.saved === "1" ? "Changes saved." : null} />
      ))}
    </Suspense>
  );
}
