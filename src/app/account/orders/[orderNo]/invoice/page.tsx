import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/store/PrintButton";
import { requireUser } from "@/lib/auth/session";
import { BRAND, formatInr } from "@/lib/brand";
import { lineTax, splitTax, toPaise, toRupees } from "@/lib/store/gst";
import { sellerDetails } from "@/lib/store/payments";
import { getMyStoreOrder } from "@/lib/store/queries";

export const metadata = { title: "GST invoice", robots: { index: false } };

const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const rupees = (paise: number) => formatInr(toRupees(paise));

async function InvoiceContent({ orderNo }: { orderNo: string }) {
  await requireUser(`/account/orders/${orderNo}/invoice`);
  const order = await getMyStoreOrder(orderNo);
  // Invoices exist only for paid orders that are being fulfilled
  if (!order || order.paymentStatus !== "captured" || order.status === "cancelled") notFound();

  const seller = sellerDetails();
  const lines = order.items.map((item) => ({ ...item, ...lineTax(toPaise(item.unitPrice), item.gstRate, item.qty) }));
  const taxTotal = lines.reduce((sum, l) => sum + l.tax, 0);
  const split = splitTax(taxTotal, seller.state, order.address.state);
  const { address } = order;

  return (
    <article className="rounded-xl border border-border bg-surface p-6 text-sm print:border-0 print:p-0">
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Tax invoice</h1>
          <p>Invoice no. {order.orderNo}</p>
          <p>Date {dateFormatter.format(new Date(order.createdAt))}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold">{seller.legalName ?? BRAND.name}</p>
          {seller.address && <p className="whitespace-pre-line">{seller.address}</p>}
          {seller.gstin && <p>GSTIN {seller.gstin}</p>}
        </div>
      </header>

      <section className="mt-6">
        <h2 className="font-semibold">Bill to</h2>
        <p>
          {address.fullName}, {address.phone}
        </p>
        <p>{[address.line1, address.line2, address.landmark].filter(Boolean).join(", ")}</p>
        <p>
          {address.city}, {address.state} {address.pincode}
        </p>
        {order.buyerGstin && <p>GSTIN {order.buyerGstin}</p>}
        <p>Place of supply: {address.state}</p>
      </section>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2">Item</th>
              <th>HSN</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Taxable value</th>
              <th className="text-right">GST %</th>
              <th className="text-right">GST</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.sku} className="border-b border-border">
                <td className="py-2">
                  {l.title}
                  <span className="block text-xs text-muted">SKU {l.sku}</span>
                </td>
                <td>{l.hsnCode ?? "-"}</td>
                <td className="text-right">{l.qty}</td>
                <td className="text-right">{rupees(l.taxable)}</td>
                <td className="text-right">{l.gstRate}%</td>
                <td className="text-right">{rupees(l.tax)}</td>
                <td className="text-right">{rupees(l.gross)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="ml-auto mt-6 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1">
        <dt>Taxable value</dt>
        <dd className="text-right">{rupees(lines.reduce((s, l) => s + l.taxable, 0))}</dd>
        {split.igst > 0 ? (
          <>
            <dt>IGST</dt>
            <dd className="text-right">{rupees(split.igst)}</dd>
          </>
        ) : (
          <>
            <dt>CGST</dt>
            <dd className="text-right">{rupees(split.cgst)}</dd>
            <dt>SGST</dt>
            <dd className="text-right">{rupees(split.sgst)}</dd>
          </>
        )}
        <dt>Delivery</dt>
        <dd className="text-right">{formatInr(order.shippingFee)}</dd>
        <dt className="font-bold">Total</dt>
        <dd className="text-right font-bold">{formatInr(order.total)}</dd>
      </dl>

      <p className="mt-6 text-xs text-muted">
        Paid online{order.paymentRef ? ` (ref. ${order.paymentRef})` : ""}. This is a computer-generated invoice.
      </p>
      <div className="mt-6 print:hidden">
        <PrintButton />
      </div>
    </article>
  );
}

export default function InvoicePage({ params }: PageProps<"/account/orders/[orderNo]/invoice">) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-surface" />}>
        {params.then(({ orderNo }) => (
          <InvoiceContent orderNo={orderNo} />
        ))}
      </Suspense>
    </section>
  );
}
