import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  replaceDeviceImage: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/catalog/queries", () => ({ CATALOG_TAG: "catalog" }));
vi.mock("@/lib/catalog/replace-device-image", () => ({ replaceDeviceImage: mocks.replaceDeviceImage }));

const { uploadDeviceImageAction } = await import("./actions");

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
