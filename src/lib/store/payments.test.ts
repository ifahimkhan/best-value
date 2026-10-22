import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { razorpayConfig, sellerDetails } = await import("./payments");

const KEYS = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const;
const SELLER = ["SELLER_LEGAL_NAME", "SELLER_GSTIN", "SELLER_ADDRESS", "SELLER_STATE"] as const;

function clearStoreEnv() {
  for (const key of [...KEYS, ...SELLER]) vi.stubEnv(key, "");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("razorpayConfig", () => {
  it("returns the keys when all three are set", () => {
    clearStoreEnv();
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_123");
    vi.stubEnv("RAZORPAY_KEY_SECRET", " secret ");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "whsec");
    expect(razorpayConfig()).toEqual({ keyId: "rzp_test_123", keySecret: "secret", webhookSecret: "whsec" });
  });

  it.each(KEYS)("is null while %s is missing", (missing) => {
    clearStoreEnv();
    for (const key of KEYS) if (key !== missing) vi.stubEnv(key, "value");
    expect(razorpayConfig()).toBeNull();
  });

  it("treats whitespace-only values as missing", () => {
    clearStoreEnv();
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_123");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "   ");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "whsec");
    expect(razorpayConfig()).toBeNull();
  });
});

describe("sellerDetails", () => {
  it("returns the configured seller", () => {
    clearStoreEnv();
    vi.stubEnv("SELLER_LEGAL_NAME", "Bharat Value Pvt Ltd");
    vi.stubEnv("SELLER_GSTIN", "29ABCDE1234F1Z5");
    vi.stubEnv("SELLER_ADDRESS", "12 MG Road, Bengaluru");
    vi.stubEnv("SELLER_STATE", "Karnataka");
    expect(sellerDetails()).toEqual({
      legalName: "Bharat Value Pvt Ltd",
      gstin: "29ABCDE1234F1Z5",
      address: "12 MG Road, Bengaluru",
      state: "Karnataka",
    });
  });

  it("uses null for unset values", () => {
    clearStoreEnv();
    expect(sellerDetails()).toEqual({ legalName: null, gstin: null, address: null, state: null });
  });
});
