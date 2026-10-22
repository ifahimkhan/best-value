import "server-only";
import { BRAND } from "@/lib/brand";
import { companyEnv, type CompanyEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sellerDetails } from "@/lib/store/payments";

export interface CompanyDetails {
  brandName: string;
  legalName: string;
  address: string | null;
  gstin: string | null;
  supportEmail: string;
  supportPhone: string | null;
  grievanceOfficer: { name: string; email: string } | null;
}

// Optional display data: a bad value should not take public pages down
function safeCompanyEnv(): CompanyEnv {
  try {
    return companyEnv();
  } catch (error) {
    logger.error("Ignoring invalid company environment variables", error);
    return {};
  }
}

/** Who runs the site, for the contact and legal pages. Read from env so nothing is hard-coded. */
export function companyDetails(): CompanyDetails {
  const seller = sellerDetails();
  const env = safeCompanyEnv();
  return {
    brandName: BRAND.name,
    legalName: seller.legalName ?? BRAND.name,
    address: seller.address,
    gstin: seller.gstin,
    supportEmail: BRAND.supportEmail,
    supportPhone: env.SUPPORT_PHONE ?? null,
    grievanceOfficer:
      env.GRIEVANCE_OFFICER_NAME && env.GRIEVANCE_OFFICER_EMAIL
        ? { name: env.GRIEVANCE_OFFICER_NAME, email: env.GRIEVANCE_OFFICER_EMAIL }
        : null,
  };
}
