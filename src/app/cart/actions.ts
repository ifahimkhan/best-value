"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { addToCart, MAX_QTY, removeFromCart, setCartQty } from "@/lib/store/cart";
import { readCart, writeCart } from "@/lib/store/cart-cookie";
import { getPricedProducts } from "@/lib/store/queries";

// Cart edits. The cookie only stores ids and quantities; prices are looked
// up fresh wherever the cart is shown.

const addSchema = z.object({
  productId: z.uuid(),
  qty: z.coerce.number().int().min(1).max(MAX_QTY),
  intent: z.enum(["cart", "buy"]).default("cart"),
});

const qtySchema = z.object({ productId: z.uuid(), qty: z.coerce.number().int().min(0).max(MAX_QTY) });
const removeSchema = z.object({ productId: z.uuid() });

export async function addToCartAction(formData: FormData): Promise<void> {
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (parsed.success) {
    const [product] = await getPricedProducts([parsed.data.productId]);
    if (product && product.stock > 0) {
      await writeCart(addToCart(await readCart(), product.id, parsed.data.qty));
    }
  }
  redirect(parsed.success && parsed.data.intent === "buy" ? "/checkout" : "/cart");
}

export async function updateCartQtyAction(formData: FormData): Promise<void> {
  const parsed = qtySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await writeCart(setCartQty(await readCart(), parsed.data.productId, parsed.data.qty));
}

export async function removeFromCartAction(formData: FormData): Promise<void> {
  const parsed = removeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await writeCart(removeFromCart(await readCart(), parsed.data.productId));
}
