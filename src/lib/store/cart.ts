import { z } from "zod";

// Cart lives in a cookie so server components can read it and price it
// fresh. The cookie only holds product ids and quantities; prices are
// always looked up on the server.

export const CART_COOKIE = "bv_cart";
export const MAX_CART_LINES = 20;
export const MAX_QTY = 5;

export interface CartLine {
  productId: string;
  qty: number;
}

export type Cart = readonly CartLine[];

const cartSchema = z
  .array(z.object({ productId: z.uuid(), qty: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) }))
  .max(MAX_CART_LINES * 2);

function mergeLines(lines: readonly CartLine[]): Cart {
  return lines.reduce<Cart>((acc, line) => addToCart(acc, line.productId, line.qty), []);
}

export function parseCart(raw: string | undefined): Cart {
  if (!raw) return [];
  try {
    const parsed = cartSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    // addToCart clamps each line to MAX_QTY
    return mergeLines(parsed.data);
  } catch {
    return [];
  }
}

export function serializeCart(cart: Cart): string {
  return JSON.stringify(cart);
}

export function addToCart(cart: Cart, productId: string, qty: number): Cart {
  const existing = cart.find((l) => l.productId === productId);
  if (existing) {
    return cart.map((l) => (l.productId === productId ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l));
  }
  if (cart.length >= MAX_CART_LINES) return cart;
  return [...cart, { productId, qty: Math.min(MAX_QTY, Math.max(1, qty)) }];
}

export function setCartQty(cart: Cart, productId: string, qty: number): Cart {
  if (qty <= 0) return removeFromCart(cart, productId);
  return cart.map((l) => (l.productId === productId ? { ...l, qty: Math.min(MAX_QTY, qty) } : l));
}

export function removeFromCart(cart: Cart, productId: string): Cart {
  return cart.filter((l) => l.productId !== productId);
}

export function cartCount(cart: Cart): number {
  return cart.reduce((sum, l) => sum + l.qty, 0);
}
