import { beforeEach, describe, expect, it, vi } from "vitest";

const A = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  readCart: vi.fn(),
  writeCart: vi.fn(),
  getPricedProducts: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/store/cart-cookie", () => ({ readCart: mocks.readCart, writeCart: mocks.writeCart }));
vi.mock("@/lib/store/queries", () => ({ getPricedProducts: mocks.getPricedProducts }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { addToCartAction, removeFromCartAction, updateCartQtyAction } from "./actions";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  Object.entries(fields).forEach(([k, v]) => data.set(k, v));
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readCart.mockResolvedValue([]);
  mocks.getPricedProducts.mockResolvedValue([{ id: A, stock: 3 }]);
});

describe("addToCartAction", () => {
  it("adds an in-stock product and opens the cart", async () => {
    await expect(addToCartAction(form({ productId: A, qty: "2" }))).rejects.toThrow("REDIRECT:/cart");
    expect(mocks.writeCart).toHaveBeenCalledWith([{ productId: A, qty: 2 }]);
  });

  it("goes straight to checkout for buy now", async () => {
    await expect(addToCartAction(form({ productId: A, qty: "1", intent: "buy" }))).rejects.toThrow("REDIRECT:/checkout");
  });

  it("ignores unknown or out-of-stock products", async () => {
    mocks.getPricedProducts.mockResolvedValue([{ id: A, stock: 0 }]);
    await expect(addToCartAction(form({ productId: A, qty: "1" }))).rejects.toThrow("REDIRECT:/cart");
    expect(mocks.writeCart).not.toHaveBeenCalled();
  });

  it("ignores malformed input", async () => {
    await expect(addToCartAction(form({ productId: "nope", qty: "1" }))).rejects.toThrow("REDIRECT:/cart");
    expect(mocks.getPricedProducts).not.toHaveBeenCalled();
  });
});

describe("cart edits", () => {
  beforeEach(() => mocks.readCart.mockResolvedValue([{ productId: A, qty: 2 }]));

  it("updates the quantity", async () => {
    await updateCartQtyAction(form({ productId: A, qty: "4" }));
    expect(mocks.writeCart).toHaveBeenCalledWith([{ productId: A, qty: 4 }]);
  });

  it("removes a line", async () => {
    await removeFromCartAction(form({ productId: A }));
    expect(mocks.writeCart).toHaveBeenCalledWith([]);
  });

  it("ignores malformed edits", async () => {
    await updateCartQtyAction(form({ productId: A, qty: "99" }));
    expect(mocks.writeCart).not.toHaveBeenCalled();
  });
});
