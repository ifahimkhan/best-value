import type { ImportRun, ImportStatus } from "@/lib/feeds/suppliers";

const STATUS_LABELS: Record<ImportStatus, string> = {
  running: "Running",
  succeeded: "Succeeded",
  partial: "Partly imported",
  failed: "Failed",
};

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export function RunHistory({ runs }: { runs: ImportRun[] }) {
  if (runs.length === 0) return <p className="text-sm text-muted">No imports yet.</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
      {runs.map((run) => (
        <li key={run.id} className="p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-medium">
              {STATUS_LABELS[run.status]} · {dateFormat.format(new Date(run.startedAt))}
            </span>
            <span className="text-muted">
              {run.rowsCreated} created · {run.rowsUpdated} updated · {run.rowsFailed} failed · {run.rowsTotal} rows
            </span>
          </div>
          {run.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-danger">{run.errors.length} problems</summary>
              <ul className="mt-2 max-h-64 list-disc space-y-1 overflow-y-auto pl-5">
                {run.errors.map((error, i) => (
                  <li key={i}>
                    {error.row !== null && `Item ${error.row}: `}
                    {error.sku && `${error.sku}: `}
                    {error.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
