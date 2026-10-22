"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { importFeedAction, previewFeedAction, type ImportState, type PreviewState } from "@/app/admin/suppliers/actions";
import type { FeedMapping } from "@/lib/feeds/mapping";
import { MappingEditor } from "./MappingEditor";

interface FeedPanelProps {
  supplierId: number;
  feedUrl: string | null;
  accept: string;
  mapping: FeedMapping;
}

const INITIAL_PREVIEW: PreviewState = {};
const INITIAL_IMPORT: ImportState = {};

function PreviewTable({ columns, sample }: { columns: string[]; sample: Record<string, string>[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-surface">
          <tr>
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-3 py-2 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sample.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {columns.map((column) => (
                <td key={column} className="max-w-48 truncate px-3 py-2" title={row[column]}>
                  {row[column]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FeedPanel({ supplierId, feedUrl, accept, mapping }: FeedPanelProps) {
  const [preview, previewAction, previewing] = useActionState(previewFeedAction, INITIAL_PREVIEW);
  const [result, importAction, importing] = useActionState(importFeedAction, INITIAL_IMPORT);
  const busy = previewing || importing;
  // Submitting by hand (not via form action) stops React resetting the form,
  // so the chosen file survives a preview and can be imported straight after
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget);
    startTransition(() => (submitter?.getAttribute("value") === "import" ? importAction(data) : previewAction(data)));
  };
  const savedColumns = Object.values(mapping.fields).filter((column): column is string => Boolean(column));

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <input type="hidden" name="supplierId" value={supplierId} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Feed file</span>
          <input type="file" name="file" accept={accept} className="block text-sm" />
          <span className="mt-1 block text-xs text-muted">
            {feedUrl ? "Leave empty to download from the saved feed URL." : "Up to 4 MB. Save a feed URL for bigger files."}
          </span>
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" value="preview" disabled={busy} className="rounded-lg border border-brand px-5 py-2 font-semibold text-brand disabled:opacity-60">
            {previewing ? "Reading…" : "Preview columns"}
          </button>
          <button type="submit" value="import" disabled={busy} className="rounded-lg bg-brand px-5 py-2 font-semibold text-brand-contrast disabled:opacity-60">
            {importing ? "Importing…" : "Import now"}
          </button>
        </div>
        <div role="status" className="space-y-1 text-sm">
          {preview.error && <p className="text-danger">{preview.error}</p>}
          {result.error && <p className="text-danger">{result.error}</p>}
          {result.summary && <p className="font-medium">{result.summary}</p>}
        </div>
      </form>

      {preview.columns && preview.sample && (
        <section className="space-y-3">
          <h2 className="font-semibold">
            Preview: {preview.rowCount?.toLocaleString("en-IN")} rows, first {preview.sample.length} shown
          </h2>
          <PreviewTable columns={preview.columns} sample={preview.sample} />
          {preview.sampleErrors && preview.sampleErrors.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-danger">
              {preview.sampleErrors.map((e, i) => (
                <li key={i}>
                  Item {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Column mapping</h2>
        {!preview.columns && savedColumns.length === 0 ? (
          <p className="text-sm text-muted">Preview a feed file first to choose its columns.</p>
        ) : (
          <MappingEditor
            key={(preview.columns ?? savedColumns).join("\u0000")}
            supplierId={supplierId}
            columns={preview.columns ?? savedColumns}
            mapping={mapping}
            suggested={preview.suggested}
          />
        )}
      </section>
    </div>
  );
}
