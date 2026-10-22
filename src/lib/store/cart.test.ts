import { describe, expect, it } from "vitest";
import { addToCart, cartCount, MAX_CART_LINES, MAX_QTY, parseCart, removeFromCart, serializeCart, setCartQty } from "./cart";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("parseCart", () => {
  it("reads a serialized cart", () => {
    const cart = [{ productId: A, qty: 2 }];
    expect(parseCart(serializeCart(cart))).toEqual(cart);
  });

  it("returns an empty cart for missing or tampered cookies", () => {
    expect(parseCart(undefined)).toEqual([]);
    expect(parseCart("not json")).toEqual([]);
    expect(parseCart(JSON.stringify([{ productId: "x", qty: 1 }]))).toEqual([]);
    expect(parseCart(JSON.stringify([{ productId: A, qty: 0 }]))).toEqual([]);
  });

  it("clamps an oversized quantity instead of dropping the cart", () => {
    expect(parseCart(JSON.stringify([{ productId: A, qty: 999 }, { productId: B, qty: 1 }]))).toEqual([
      { productId: A, qty: MAX_QTY },
      { productId: B, qty: 1 },
    ]);
  });

  it("merges duplicate lines", () => {
    expect(parseCart(JSON.stringify([{ productId: A, qty: 1 }, { productId: A, qty: 2 }]))).toEqual([{ productId: A, qty: 3 }]);
  });
});

describe("cart updates", () => {
  it("adds new lines and increases existing ones without mutating", () => {
    const start = [{ productId: A, qty: 1 }];
    const added = addToCart(start, A, 2);
    expect(added).toEqual([{ productId: A, qty: 3 }]);
    expect(start).toEqual([{ productId: A, qty: 1 }]);
    expect(addToCart(added, B, 1)).toHaveLength(2);
  });

  it("caps quantity per line", () => {
    expect(addToCart([{ productId: A, qty: MAX_QTY }], A, 1)).toEqual([{ productId: A, qty: MAX_QTY }]);
  });

  it("refuses new lines when the cart is full", () => {
    const full = Array.from({ length: MAX_CART_LINES }, (_, i) => ({
      productId: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`,
      qty: 1,
    }));
    expect(addToCart(full, A, 1)).toBe(full);
  });

  it("sets and removes quantities", () => {
    const cart = [{ productId: A, qty: 1 }, { productId: B, qty: 1 }];
    expect(setCartQty(cart, A, 4)).toEqual([{ productId: A, qty: 4 }, { productId: B, qty: 1 }]);
    expect(setCartQty(cart, A, 0)).toEqual([{ productId: B, qty: 1 }]);
    expect(removeFromCart(cart, B)).toEqual([{ productId: A, qty: 1 }]);
  });

  it("counts items", () => {
    expect(cartCount([{ productId: A, qty: 2 }, { productId: B, qty: 3 }])).toBe(5);
  });
});
