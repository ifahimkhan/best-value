import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

// Counts are keyed by "<table>" for the global count or "<table>:<column>" for a filtered one
interface Fake {
  counts: Record<string, number>;
  countError?: unknown;
  insertError?: unknown;
  inserted: unknown[];
}

const fake: Fake = { counts: {}, inserted: [] };

function countQuery(table: string) {
  let key = table;
  const chain = {
    gte: () => chain,
    eq: (column: string) => {
      key = `${table}:${column}`;
      return chain;
    },
    then: (resolve: (value: { count: number; error: unknown }) => unknown) =>
      Promise.resolve({ count: fake.counts[key] ?? 0, error: fake.countError ?? null }).then(resolve),
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => countQuery(table),
      insert: (row: unknown) => {
        fake.inserted.push(row);
        return Promise.resolve({ error: fake.insertError ?? null });
      },
    }),
  }),
}));

const { saveContactMessage, subscribeNewsletter, CONTACT_LIMITS, NEWSLETTER_LIMITS } = await import("./messages");

const MESSAGE = {
  name: "Asha",
  email: "asha@example.com",
  phone: null,
  topic: "order" as const,
  orderNo: "BV-O-000123",
  message: "Where is my parcel?",
};
const NOW = new Date("2026-10-22T10:00:00Z");
const CLIENT = "a".repeat(64);

beforeEach(() => {
  fake.counts = {};
  fake.countError = undefined;
  fake.insertError = undefined;
  fake.inserted = [];
});

describe("saveContactMessage", () => {
  it("saves a message under the limits", async () => {
    fake.counts = { contact_messages: 5 };
    expect(await saveContactMessage(MESSAGE, "user-1", CLIENT, NOW)).toBe("saved");
    expect(fake.inserted).toEqual([
      {
        name: "Asha",
        email: "asha@example.com",
        phone: null,
        topic: "order",
        order_no: "BV-O-000123",
        message: "Where is my parcel?",
        user_id: "user-1",
        client_hash: CLIENT,
      },
    ]);
  });

  it("limits one client even when it changes the email", async () => {
    fake.counts = { "contact_messages:client_hash": CONTACT_LIMITS.perClient };
    expect(await saveContactMessage(MESSAGE, null, CLIENT, NOW)).toBe("rate_limited");
    expect(fake.inserted).toEqual([]);
  });

  it("limits repeat messages from one email", async () => {
    fake.counts = { "contact_messages:email": CONTACT_LIMITS.perEmail };
    expect(await saveContactMessage(MESSAGE, null, CLIENT, NOW)).toBe("rate_limited");
  });

  it("keeps a global ceiling", async () => {
    fake.counts = { contact_messages: CONTACT_LIMITS.global };
    expect(await saveContactMessage(MESSAGE, null, null, NOW)).toBe("rate_limited");
  });

  it("skips the client limit when the address is unknown", async () => {
    fake.counts = { "contact_messages:client_hash": 999 };
    expect(await saveContactMessage(MESSAGE, null, null, NOW)).toBe("saved");
  });

  it("reports database errors", async () => {
    fake.countError = { message: "down" };
    expect(await saveContactMessage(MESSAGE, null, CLIENT, NOW)).toBe("error");
    fake.countError = undefined;
    fake.insertError = { message: "check violation" };
    expect(await saveContactMessage(MESSAGE, null, CLIENT, NOW)).toBe("error");
  });
});

describe("subscribeNewsletter", () => {
  it("treats repeat signups as success", async () => {
    expect(await subscribeNewsletter("a@b.co", CLIENT, NOW)).toBe("subscribed");
    expect(fake.inserted).toEqual([{ email: "a@b.co", client_hash: CLIENT }]);
    fake.insertError = { code: "23505" };
    expect(await subscribeNewsletter("a@b.co", CLIENT, NOW)).toBe("subscribed");
    fake.insertError = { code: "500" };
    expect(await subscribeNewsletter("a@b.co", CLIENT, NOW)).toBe("error");
  });

  it("rate limits per client and globally", async () => {
    fake.counts = { "newsletter_subscribers:client_hash": NEWSLETTER_LIMITS.perClient };
    expect(await subscribeNewsletter("a@b.co", CLIENT, NOW)).toBe("rate_limited");
    fake.counts = { newsletter_subscribers: NEWSLETTER_LIMITS.global };
    expect(await subscribeNewsletter("a@b.co", null, NOW)).toBe("rate_limited");
    expect(fake.inserted).toEqual([]);
  });
});
