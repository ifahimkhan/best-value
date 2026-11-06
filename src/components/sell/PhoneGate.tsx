import { PhoneForm } from "@/app/auth/phone/PhoneForm";

interface PhoneGateProps {
  /** Page to return to after the number is saved (the current sell page). */
  returnTo: string;
}

/** Shown to signed-in users with no mobile number on their profile, before they can book a pickup. */
export function PhoneGate({ returnTo }: PhoneGateProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="font-semibold">Add your mobile number to continue</p>
      <p className="mb-4 mt-1 text-sm text-muted">
        Our pickup agent needs a number to reach you. Your answers are saved. No verification code needed.
      </p>
      <PhoneForm next={returnTo} />
    </div>
  );
}
