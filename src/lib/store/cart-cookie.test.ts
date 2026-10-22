import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CART_COOKIE, serializeCart } from "./cart";

const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => jar }));

const { readCart, writeCart } = await import("./cart-cookie");

const ID_A = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const ID_B = "16fd2706-8baf-433b-82eb-8c7fada847da";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readCart", () => {
  it("parses the cart cookie", async () => {
    jar.get.mockReturnValue({ value: JSON.stringify([{ productId: ID_A, qty: 2 }]) });
    expect(await readCart()).toEqual([{ productId: ID_A, qty: 2 }]);
    expect(jar.get).toHaveBeenCalledWith(CART_COOKIE);
  });

  it("returns an empty cart without a cookie", async () => {
    jar.get.mockReturnValue(undefined);
    expect(await readCart()).toEqual([]);
  });

  it("returns an empty cart for a tampered cookie", async () => {
    jar.get.mockReturnValue({ value: "not-json" });
    expect(await readCart()).toEqual([]);
  });
});

describe("writeCart", () => {
  it("deletes the cookie for an empty cart", async () => {
    await writeCart([]);
    expect(jar.delete).toHaveBeenCalledWith(CART_COOKIE);
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("stores the cart as an httpOnly 30 day cookie", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const cart = [
      { productId: ID_A, qty: 1 },
      { productId: ID_B, qty: 3 },
    ];
    await writeCart(cart);
    expect(jar.delete).not.toHaveBeenCalled();
    expect(jar.set).toHaveBeenCalledWith(CART_COOKIE, serializeCart(cart), {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  });

  it("marks the cookie secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await writeCart([{ productId: ID_A, qty: 1 }]);
    expect(jar.set).toHaveBeenCalledWith(CART_COOKIE, expect.any(String), expect.objectContaining({ secure: true }));
  });
});
