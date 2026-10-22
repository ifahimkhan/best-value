import Link from "next/link";
import { Suspense } from "react";
import { ProductForm } from "@/components/admin/products/ProductForm";
import { requireStaff } from "@/lib/auth/session";
import { listProductOptions } from "@/lib/products/queries";

export const metadata = { title: "Add product", robots: { index: false } };

async function NewProduct() {
  await requireStaff();
  const { brands, categories } = await listProductOptions();
  return <ProductForm brands={brands} categories={categories} />;
}

export default function NewProductPage() {
  return (
    <section className="space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-brand underline">
          All products
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Add product</h1>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface" />}>
        <NewProduct />
      </Suspense>
    </section>
  );
}
