import type { OrderEvent } from "@/lib/admin/events";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export function EventTimeline({ events, labels }: { events: OrderEvent[]; labels: Readonly<Record<string, string>> }) {
  if (events.length === 0) return <p className="text-sm text-muted">No staff changes yet.</p>;
  return (
    <ol className="space-y-2 text-sm">
      {events.map((event, i) => (
        <li key={i} className="rounded-lg border border-border bg-surface p-3">
          <span className="font-medium">
            {labels[event.fromStatus] ?? event.fromStatus} → {labels[event.toStatus] ?? event.toStatus}
          </span>
          <span className="block text-muted">
            {dateFormat.format(new Date(event.createdAt))}
            {event.actorName && ` · ${event.actorName}`}
            {event.note && ` · ${event.note}`}
          </span>
        </li>
      ))}
    </ol>
  );
}
