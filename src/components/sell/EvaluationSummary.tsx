import { formatInr } from "@/lib/brand";
import type { QuoteResult } from "@/lib/sell/pricing";

interface EvaluationSummaryProps {
  deviceTitle: string;
  variantLabel: string;
  basePrice: number;
  quote: QuoteResult;
  isComplete: boolean;
}

export function EvaluationSummary({ deviceTitle, variantLabel, basePrice, quote, isComplete }: EvaluationSummaryProps) {
  const deductions = quote.ok ? quote.deductions : [];
  return (
    <aside className="rounded-xl border border-border bg-surface p-5 lg:sticky lg:top-6">
      <h2 className="font-semibold">Evaluation summary</h2>
      <p className="mt-1 text-sm text-muted">
        {deviceTitle} · {variantLabel}
      </p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt>Best price</dt>
          <dd>{formatInr(basePrice)}</dd>
        </div>
        {deductions.map((d) => (
          <div key={`${d.questionId}-${d.label}`} className="flex justify-between text-muted">
            <dt>{d.label}</dt>
            <dd>−{formatInr(d.amount)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 border-t border-border pt-4">
        <p className="text-sm text-muted">{isComplete ? "Your price" : "Estimated price so far"}</p>
        <p className="text-2xl font-bold text-brand" aria-live="polite">
          {quote.ok ? formatInr(quote.price) : "—"}
        </p>
      </div>
    </aside>
  );
}
