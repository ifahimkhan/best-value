import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  processDeviceImage: vi.fn(),
  uploadDeviceImage: vi.fn(),
  setDeviceImage: vi.fn(),
  removeDeviceImage: vi.fn(),
}));
vi.mock("./device-image", () => ({ processDeviceImage: mocks.processDeviceImage }));
vi.mock("./admin-devices", () => ({
  uploadDeviceImage: mocks.uploadDeviceImage,
  setDeviceImage: mocks.setDeviceImage,
  removeDeviceImage: mocks.removeDeviceImage,
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
});

describe("replaceDeviceImage", () => {
  it("uploads the processed photo, saves it and removes the old one", async () => {
    expect(await replaceDeviceImage(7, INPUT)).toEqual({ ok: true, url: NEW_URL, bytes: WEBP.length });
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
