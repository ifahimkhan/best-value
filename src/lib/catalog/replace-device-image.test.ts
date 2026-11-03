import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  processDeviceImage: vi.fn(),
  uploadDeviceImage: vi.fn(),
  setDeviceImage: vi.fn(),
  removeDeviceImage: vi.fn(),
  applyImageToDeviceProducts: vi.fn(),
  isImageUsedByProducts: vi.fn(),
}));
vi.mock("./device-image", () => ({ processDeviceImage: mocks.processDeviceImage }));
vi.mock("./admin-devices", () => ({
  uploadDeviceImage: mocks.uploadDeviceImage,
  setDeviceImage: mocks.setDeviceImage,
  removeDeviceImage: mocks.removeDeviceImage,
}));

vi.mock("./device-products", () => ({
  applyImageToDeviceProducts: mocks.applyImageToDeviceProducts,
  isImageUsedByProducts: mocks.isImageUsedByProducts,
}));

const { replaceDeviceImage } = await import("./replace-device-image");

const INPUT = Buffer.from("original");
const WEBP = Buffer.from("small-webp");
const NEW_URL = "https://db.example.com/storage/v1/object/public/product-images/catalog/devices/7/new.webp";
const OLD_URL = "https://db.example.com/storage/v1/object/public/product-images/catalog/devices/7/old.webp";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.processDeviceImage.mockResolvedValue({ ok: true, body: WEBP, contentType: "image/webp" });
  mocks.uploadDeviceImage.mockResolvedValue(NEW_URL);
  mocks.setDeviceImage.mockResolvedValue({ ok: true, previous: OLD_URL });
  mocks.removeDeviceImage.mockResolvedValue(undefined);
  mocks.applyImageToDeviceProducts.mockResolvedValue({ updated: 3, skippedFull: 0, failed: 0 });
  mocks.isImageUsedByProducts.mockResolvedValue(false);
});

describe("replaceDeviceImage", () => {
  it("shares the one uploaded photo with the device's shop products when asked", async () => {
    expect(await replaceDeviceImage(7, INPUT, { applyToProducts: true })).toEqual({
      ok: true,
      url: NEW_URL,
      bytes: WEBP.length,
      products: { updated: 3, skippedFull: 0, failed: 0 },
    });
    expect(mocks.uploadDeviceImage).toHaveBeenCalledTimes(1);
    expect(mocks.applyImageToDeviceProducts).toHaveBeenCalledWith(7, NEW_URL);
    expect(mocks.removeDeviceImage).toHaveBeenCalledWith(7, OLD_URL);
  });

  it("keeps the old photo while a shop product still shows it", async () => {
    mocks.isImageUsedByProducts.mockResolvedValue(true);
    await replaceDeviceImage(7, INPUT);
    expect(mocks.isImageUsedByProducts).toHaveBeenCalledWith(OLD_URL);
    expect(mocks.removeDeviceImage).not.toHaveBeenCalled();
  });

  it("has nothing to delete when the device had no photo", async () => {
    mocks.setDeviceImage.mockResolvedValue({ ok: true, previous: null });
    await replaceDeviceImage(7, INPUT);
    expect(mocks.isImageUsedByProducts).not.toHaveBeenCalled();
    expect(mocks.removeDeviceImage).not.toHaveBeenCalled();
  });

  it("uploads the processed photo, saves it and removes the old one", async () => {
    expect(await replaceDeviceImage(7, INPUT)).toEqual({
      ok: true,
      url: NEW_URL,
      bytes: WEBP.length,
      products: { updated: 0, skippedFull: 0, failed: 0 },
    });
    expect(mocks.applyImageToDeviceProducts).not.toHaveBeenCalled();
    expect(mocks.processDeviceImage).toHaveBeenCalledWith(INPUT);
    expect(mocks.uploadDeviceImage).toHaveBeenCalledWith(7, WEBP);
    expect(mocks.setDeviceImage).toHaveBeenCalledWith(7, NEW_URL);
    expect(mocks.removeDeviceImage).toHaveBeenCalledWith(7, OLD_URL);
  });

  it("stops before uploading when the image is rejected", async () => {
    mocks.processDeviceImage.mockResolvedValue({ ok: false, error: "Each image must be 5 MB or smaller." });
    expect(await replaceDeviceImage(7, INPUT)).toEqual({ ok: false, error: "Each image must be 5 MB or smaller." });
    expect(mocks.uploadDeviceImage).not.toHaveBeenCalled();
  });

  it("reports a failed upload without touching the device", async () => {
    mocks.uploadDeviceImage.mockRejectedValue(new Error("Device image upload failed"));
    expect(await replaceDeviceImage(7, INPUT)).toEqual({ ok: false, error: "The image could not be uploaded. Please try again." });
    expect(mocks.setDeviceImage).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", "This device no longer exists."],
    ["error", "The image could not be saved. Please try again."],
  ])("removes the new upload when saving fails with %s", async (error, message) => {
    mocks.setDeviceImage.mockResolvedValue({ ok: false, error });
    expect(await replaceDeviceImage(7, INPUT)).toEqual({ ok: false, error: message });
    expect(mocks.removeDeviceImage).toHaveBeenCalledWith(7, NEW_URL);
    expect(mocks.removeDeviceImage).not.toHaveBeenCalledWith(7, OLD_URL);
  });
});
