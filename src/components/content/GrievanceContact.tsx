import { companyDetails } from "@/lib/content/company";

/** Grievance officer block required on Indian e-commerce and privacy pages. */
export function GrievanceContact() {
  const company = companyDetails();
  const officer = company.grievanceOfficer;
  return (
    <div className="rounded-xl border border-border bg-surface p-5 text-sm">
      <p className="font-semibold">Grievance Officer</p>
      {officer ? (
        <p className="mt-1">
          {officer.name}
          <br />
          <a href={`mailto:${officer.email}`}>{officer.email}</a>
        </p>
      ) : (
        <p className="mt-1">
          Write to <a href={`mailto:${company.supportEmail}`}>{company.supportEmail}</a> with the subject &quot;Grievance&quot;.
        </p>
      )}
      <p className="mt-2">
        {company.legalName}
        {company.address && (
          <>
            <br />
            {company.address}
          </>
        )}
      </p>
      <p className="mt-2 text-muted">We acknowledge complaints within 48 hours and aim to resolve them within one month.</p>
    </div>
  );
}
