import { afterEach, describe, expect, it, vi } from "vitest";

const logError = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: logError, warn: vi.fn(), info: vi.fn() } }));

const { companyDetails } = await import("./company");
const { BRAND } = await import("@/lib/brand");

const ENV_KEYS = [
  "SELLER_LEGAL_NAME",
  "SELLER_GSTIN",
  "SELLER_ADDRESS",
  "SUPPORT_PHONE",
  "GRIEVANCE_OFFICER_NAME",
  "GRIEVANCE_OFFICER_EMAIL",
] as const;

function clearEnv() {
  for (const key of ENV_KEYS) vi.stubEnv(key, "");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("companyDetails", () => {
  it("falls back to the brand when nothing is configured", () => {
    clearEnv();
    expect(companyDetails()).toEqual({
      brandName: BRAND.name,
      legalName: BRAND.name,
      address: null,
      gstin: null,
      supportEmail: BRAND.supportEmail,
      supportPhone: null,
      grievanceOfficer: null,
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it("uses seller and company settings from the environment", () => {
    clearEnv();
    vi.stubEnv("SELLER_LEGAL_NAME", "Best Value Pvt Ltd");
    vi.stubEnv("SELLER_GSTIN", "29ABCDE1234F1Z5");
    vi.stubEnv("SELLER_ADDRESS", "1 MG Road, Bengaluru");
    vi.stubEnv("SUPPORT_PHONE", "+91 98765 43210");
    vi.stubEnv("GRIEVANCE_OFFICER_NAME", "Ravi Kumar");
    vi.stubEnv("GRIEVANCE_OFFICER_EMAIL", "grievance@example.com");
    expect(companyDetails()).toMatchObject({
      legalName: "Best Value Pvt Ltd",
      gstin: "29ABCDE1234F1Z5",
      address: "1 MG Road, Bengaluru",
      supportPhone: "+91 98765 43210",
      grievanceOfficer: { name: "Ravi Kumar", email: "grievance@example.com" },
    });
  });

  it("omits the grievance officer unless both name and email are set", () => {
    clearEnv();
    vi.stubEnv("GRIEVANCE_OFFICER_NAME", "Ravi Kumar");
    expect(companyDetails().grievanceOfficer).toBeNull();
  });

  it("ignores invalid company settings instead of throwing", () => {
    clearEnv();
    vi.stubEnv("SUPPORT_PHONE", "call us");
    vi.stubEnv("GRIEVANCE_OFFICER_NAME", "Ravi Kumar");
    vi.stubEnv("GRIEVANCE_OFFICER_EMAIL", "grievance@example.com");
    const details = companyDetails();
    expect(details.supportPhone).toBeNull();
    expect(details.grievanceOfficer).toBeNull();
    expect(logError).toHaveBeenCalledWith("Ignoring invalid company environment variables", expect.any(Error));
  });
});
