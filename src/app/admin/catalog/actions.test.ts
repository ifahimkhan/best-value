import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  replaceDeviceImage: vi.fn(),
  updateTag: vi.fn(),
  createDevice: vi.fn(),
  setVariantPrices: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/catalog/admin-device-write", () => ({ createDevice: mocks.createDevice, setVariantPrices: mocks.setVariantPrices }));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/catalog/queries", () => ({ CATALOG_TAG: "catalog" }));
vi.mock("@/lib/catalog/replace-device-image", () => ({ replaceDeviceImage: mocks.replaceDeviceImage }));

const { createDeviceAction, saveVariantPricesAction, uploadDeviceImageAction } = await import("./actions");

const URL = "https://db.example.com/storage/v1/object/public/product-images/catalog/devices/7/a.webp";

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const image = (bytes: number) => new File([new Uint8Array(bytes)], "phone.jpg", { type: "image/jpeg" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "u1", role: "admin" });
  mocks.replaceDeviceImage.mockResolvedValue({ ok: true, url: URL, bytes: 12_800 });
  mocks.createDevice.mockResolvedValue({ ok: true, id: 1501 });
  mocks.setVariantPrices.mockResolvedValue({ ok: true, updated: 2 });
});

describe("uploadDeviceImageAction", () => {
  it("replaces the image and refreshes the catalog cache", async () => {
    const result = await uploadDeviceImageAction({}, form({ deviceId: "7", image: image(100) }));
    expect(result).toEqual({ done: "Saved (12.5 KB).", imageUrl: URL });
    expect(mocks.replaceDeviceImage).toHaveBeenCalledWith(7, expect.any(Buffer));
    expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
  });

  it("checks admin access before reading the form", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(uploadDeviceImageAction({}, form({ deviceId: "7", image: image(100) }))).rejects.toThrow("NOT_FOUND");
    expect(mocks.replaceDeviceImage).not.toHaveBeenCalled();
  });

  it.each([
    [{ deviceId: "abc", image: image(100) }, "Unknown device."],
    [{ image: image(100) }, "Unknown device."],
    [{ deviceId: "7" }, "Choose an image first."],
    [{ deviceId: "7", image: "not-a-file" }, "Choose an image first."],
    [{ deviceId: "7", image: image(0) }, "Choose an image first."],
    [{ deviceId: "7", image: image(4 * 1024 * 1024 + 1) }, "Pick an image of 4 MB or less."],
  ])("rejects bad input %#", async (fields, error) => {
    expect(await uploadDeviceImageAction({}, form(fields))).toEqual({ error });
    expect(mocks.replaceDeviceImage).not.toHaveBeenCalled();
  });

  it("passes processing errors through without refreshing the cache", async () => {
    mocks.replaceDeviceImage.mockResolvedValue({ ok: false, error: "This device no longer exists." });
    expect(await uploadDeviceImageAction({}, form({ deviceId: "7", image: image(100) }))).toEqual({ error: "This device no longer exists." });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
});

const DEVICE = { category: "phone", brand: "samsung", name: "Galaxy S26", isActive: "on", variantRam: "8", variantStorage: "256", variantPrice: "45000" };

describe("createDeviceAction", () => {
  it("creates the device and opens it", async () => {
    await expect(createDeviceAction({}, form(DEVICE))).rejects.toThrow("REDIRECT:/admin/catalog/1501?created=1");
    expect(mocks.createDevice).toHaveBeenCalledWith(expect.objectContaining({ name: "Galaxy S26", slug: "galaxy-s26" }));
    expect(mocks.replaceDeviceImage).not.toHaveBeenCalled();
    expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
  });

  it("saves an attached photo for the new device", async () => {
    await expect(createDeviceAction({}, form({ ...DEVICE, image: image(100) }))).rejects.toThrow("REDIRECT:/admin/catalog/1501?created=1");
    expect(mocks.replaceDeviceImage).toHaveBeenCalledWith(1501, expect.any(Buffer));
  });

  it("still opens the device when its photo is rejected", async () => {
    mocks.replaceDeviceImage.mockResolvedValue({ ok: false, error: "bad" });
    await expect(createDeviceAction({}, form({ ...DEVICE, image: image(100) }))).rejects.toThrow("REDIRECT:/admin/catalog/1501?created=1&photo=failed");
  });

  it("checks admin access first", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(createDeviceAction({}, form(DEVICE))).rejects.toThrow("NOT_FOUND");
    expect(mocks.createDevice).not.toHaveBeenCalled();
  });

  it("returns field errors without saving", async () => {
    const result = await createDeviceAction({}, form({ ...DEVICE, name: "" }));
    expect(result).toEqual({ error: "Please check the highlighted fields.", fieldErrors: { name: "Enter the device name" } });
    expect(mocks.createDevice).not.toHaveBeenCalled();
  });

  it("rejects an oversized photo before creating anything", async () => {
    const result = await createDeviceAction({}, form({ ...DEVICE, image: image(4 * 1024 * 1024 + 1) }));
    expect(result.fieldErrors).toEqual({ image: "Pick an image of 4 MB or less." });
    expect(mocks.createDevice).not.toHaveBeenCalled();
  });

  it("explains duplicates and other failures", async () => {
    mocks.createDevice.mockResolvedValueOnce({ ok: false, error: "duplicate" });
    expect((await createDeviceAction({}, form(DEVICE))).fieldErrors).toEqual({
      name: "This brand already has this device in this category (names are compared by their web address)",
    });
    mocks.createDevice.mockResolvedValueOnce({ ok: false, error: "error" });
    expect(await createDeviceAction({}, form(DEVICE))).toEqual({ error: "The device could not be added. Please try again." });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
});

describe("saveVariantPricesAction", () => {
  it("saves prices and refreshes the catalog", async () => {
    const result = await saveVariantPricesAction({}, form({ deviceId: "7", "price-11": "27000", "price-12": "31,000" }));
    expect(result).toEqual({ done: "Saved 2 prices." });
    expect(mocks.setVariantPrices).toHaveBeenCalledWith(7, [
      { variant_id: 11, price: 27000 },
      { variant_id: 12, price: 31000 },
    ]);
    expect(mocks.updateTag).toHaveBeenCalledWith("catalog");
  });

  it("warns when only some prices were saved", async () => {
    mocks.setVariantPrices.mockResolvedValue({ ok: true, updated: 1 });
    expect(await saveVariantPricesAction({}, form({ deviceId: "7", "price-11": "1", "price-12": "2" }))).toEqual({
      error: "Saved 1 price. Some variants were removed meanwhile. Reload the page.",
    });
  });

  it("still opens a new device when reading its photo throws", async () => {
    mocks.replaceDeviceImage.mockRejectedValue(new Error("boom"));
    await expect(createDeviceAction({}, form({ ...DEVICE, image: image(100) }))).rejects.toThrow(
      "REDIRECT:/admin/catalog/1501?created=1&photo=failed",
    );
  });

  it("uses the singular for one price", async () => {
    mocks.setVariantPrices.mockResolvedValue({ ok: true, updated: 1 });
    expect(await saveVariantPricesAction({}, form({ deviceId: "7", "price-11": "1" }))).toEqual({ done: "Saved 1 price." });
  });

  it("checks admin access first", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(saveVariantPricesAction({}, form({ deviceId: "7", "price-11": "1" }))).rejects.toThrow("NOT_FOUND");
    expect(mocks.setVariantPrices).not.toHaveBeenCalled();
  });

  it.each([
    [{ "price-11": "1" }, { error: "Unknown device." }],
    [{ deviceId: "7" }, { error: "There are no prices to save." }],
    [{ deviceId: "7", "price-11": "abc" }, { error: "Please check the highlighted prices.", fieldErrors: { "11": "Enter a price from ₹0 to ₹10,00,000" } }],
  ])("rejects bad input %#", async (fields, expected) => {
    expect(await saveVariantPricesAction({}, form(fields))).toEqual(expected);
    expect(mocks.setVariantPrices).not.toHaveBeenCalled();
  });

  it("reports database failures and variants that are gone", async () => {
    mocks.setVariantPrices.mockResolvedValueOnce({ ok: false });
    expect(await saveVariantPricesAction({}, form({ deviceId: "7", "price-11": "1" }))).toEqual({
      error: "The prices could not be saved. Please try again.",
    });
    mocks.setVariantPrices.mockResolvedValueOnce({ ok: true, updated: 0 });
    expect(await saveVariantPricesAction({}, form({ deviceId: "7", "price-11": "1" }))).toEqual({
      error: "This device no longer has these variants. Reload the page.",
    });
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });
});
