import { Suspense } from "react";
import { FilterTabs, pickFilter } from "@/components/admin/orders/FilterTabs";
import { requireStaff } from "@/lib/auth/session";
import { CONTACT_TOPIC_LABELS } from "@/lib/content/forms";
import { INBOX_FILTERS, INBOX_LIMIT, listContactMessages, type InboxFilter } from "@/lib/content/messages";
import { toggleMessageHandledAction } from "./actions";

export const metadata = { title: "Messages", robots: { index: false } };

const FILTER_LABELS: Record<InboxFilter, string> = { open: "Open", handled: "Handled", all: "All" };
const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

async function Inbox({ filter }: { filter: InboxFilter }) {
  await requireStaff();
  const messages = await listContactMessages(filter);
  if (messages.length === 0) return <p className="text-sm text-muted">No messages here.</p>;
  return (
    <>
      <ul className="space-y-4">
        {messages.map((m) => (
          <li key={m.id} className="rounded-xl border border-border bg-surface p-5 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">
                {m.name} · <a href={`mailto:${m.email}`} className="text-brand underline">{m.email}</a>
                {m.phone && (
                  <>
                    {" "}
                    · <a href={`tel:${m.phone}`} className="text-brand underline">{m.phone}</a>
                  </>
                )}
              </p>
              <p className="text-xs text-muted">{dateFormat.format(new Date(m.createdAt))}</p>
            </div>
            <p className="mt-1 text-xs text-muted">
              {CONTACT_TOPIC_LABELS[m.topic]}
              {m.orderNo && ` · order ${m.orderNo}`}
            </p>
            <p className="mt-3 whitespace-pre-wrap">{m.message}</p>
            <form action={toggleMessageHandledAction} className="mt-4">
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="handled" value={m.handledAt ? "false" : "true"} />
              <button type="submit" className="rounded-lg border border-brand px-3 py-1.5 text-xs font-semibold text-brand">
                {m.handledAt ? "Reopen" : "Mark handled"}
              </button>
            </form>
          </li>
        ))}
      </ul>
      {messages.length === INBOX_LIMIT && <p className="mt-3 text-sm text-muted">Showing the latest {INBOX_LIMIT} messages.</p>}
    </>
  );
}

export default function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Customer messages</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        {searchParams.then((query) => {
          const filter = pickFilter(INBOX_FILTERS, query.status);
          return (
            <>
              <FilterTabs basePath="/admin/messages" options={INBOX_FILTERS} labels={FILTER_LABELS} current={filter} />
              <Inbox filter={filter} />
            </>
          );
        })}
      </Suspense>
    </section>
  );
}
