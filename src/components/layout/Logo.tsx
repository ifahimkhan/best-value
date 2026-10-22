import { BRAND } from "@/lib/brand";

interface LogoProps {
  className?: string;
}

/** Gold serif wordmark: "Best", the interlocked BV monogram, then "Value". */
export function Logo({ className = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-baseline font-display leading-none ${className}`} aria-label={BRAND.name} role="img">
      <span aria-hidden="true" className="text-gold">
        Best
      </span>
      {/* B sits high and left, V low and right, overlapping like the printed mark */}
      <span aria-hidden="true" className="relative mx-[0.12em] inline-block h-[1em] w-[1.1em]">
        <span className="text-gold absolute -top-[0.38em] left-0 text-[1.05em]">B</span>
        <span className="text-gold absolute -top-[0.08em] left-[0.36em] text-[1.05em]">V</span>
      </span>
      <span aria-hidden="true" className="text-gold">
        Value
      </span>
    </span>
  );
}
