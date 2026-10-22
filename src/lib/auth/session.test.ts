import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
const mocks = vi.hoisted(() => ({
  logError: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn((): never => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.logError, warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));

const { getSessionUser, requireStaff, requireUser } = await import("./session");
const { callArgs } = await import("@/test/fake-supabase");

interface AuthStub {
  auth: { getClaims: () => Promise<{ data: unknown; error: unknown }> };
}

function profile(role: string) {
  return { id: "u1", full_name: "Asha", email: "asha@example.com", phone: "+91 98765 43210", role };
}

function signIn(role: string) {
  fake.setUser({ id: "u1", email: "asha@example.com" });
  fake.respond("profiles", { data: profile(role) });
}

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("getSessionUser", () => {
  it("returns null when signed out without querying profiles", async () => {
    expect(await getSessionUser()).toBeNull();
    expect(fake.queriesFor("profiles")).toHaveLength(0);
  });

  it("returns null when the claims lookup errors", async () => {
    fake.setUser({ id: "u1" });
    vi.spyOn((fake.client as AuthStub).auth, "getClaims").mockResolvedValue({
      data: { claims: { sub: "u1" } },
      error: new Error("jwt expired"),
    });
    expect(await getSessionUser()).toBeNull();
    expect(fake.queriesFor("profiles")).toHaveLength(0);
  });

  it("maps the signed-in user's profile", async () => {
    signIn("customer");
    expect(await getSessionUser()).toEqual({
      id: "u1",
      fullName: "Asha",
      email: "asha@example.com",
      phone: "+91 98765 43210",
      role: "customer",
    });
    expect(callArgs(fake.queriesFor("profiles")[0], "eq")).toEqual(["id", "u1"]);
  });

  it("logs and returns null when the profile lookup fails", async () => {
    fake.setUser({ id: "u1" });
    const error = { message: "boom" };
    fake.respond("profiles", { error });
    expect(await getSessionUser()).toBeNull();
    expect(mocks.logError).toHaveBeenCalledWith("Profile lookup failed for signed-in user", error, { userId: "u1" });
  });

  it("returns null when the profile row is missing", async () => {
    fake.setUser({ id: "u1" });
    expect(await getSessionUser()).toBeNull();
    expect(mocks.logError).toHaveBeenCalledOnce();
  });
});

describe("requireUser", () => {
  it("redirects signed-out visitors to login with the default next path", async () => {
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login?next=%2Faccount");
  });

  it("encodes a custom next path", async () => {
    await expect(requireUser("/sell?step=2&x=1")).rejects.toThrow("REDIRECT:/login?next=%2Fsell%3Fstep%3D2%26x%3D1");
  });

  it("redirects when the profile cannot be loaded", async () => {
    fake.setUser({ id: "u1" });
    fake.respond("profiles", { error: { message: "down" } });
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("returns the signed-in user", async () => {
    signIn("customer");
    await expect(requireUser()).resolves.toMatchObject({ id: "u1", role: "customer" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("requireStaff", () => {
  it("redirects signed-out visitors to login with the admin path", async () => {
    await expect(requireStaff()).rejects.toThrow("REDIRECT:/login?next=%2Fadmin");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("answers not found for customers", async () => {
    signIn("customer");
    await expect(requireStaff()).rejects.toThrow("NOT_FOUND");
  });

  it.each(["staff", "admin"])("allows the %s role", async (role) => {
    signIn(role);
    await expect(requireStaff()).resolves.toMatchObject({ role });
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
