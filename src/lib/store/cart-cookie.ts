import "server-only";
import { cookies } from "next/headers";
import { CART_COOKIE, parseCart, serializeCart, type Cart } from "./cart";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Reads cookies: render callers inside <Suspense>. */
export async function readCart(): Promise<Cart> {
  const store = await cookies();
  return parseCart(store.get(CART_COOKIE)?.value);
}

/** Only callable from Server Actions or Route Handlers. */
export async function writeCart(cart: Cart): Promise<void> {
  const store = await cookies();
  if (cart.length === 0) {
    store.delete(CART_COOKIE);
    return;
  }
  store.set(CART_COOKIE, serializeCart(cart), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}
