import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
const logError = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: logError, warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.client }));

const { INBOX_FILTERS, INBOX_LIMIT, listContactMessages, setMessageHandled } = await import("./messages");
const { allCalls, callArgs } = await import("@/test/fake-supabase");

const ROW = {
  id: 7,
  name: "Asha",
  email: "asha@example.com",
  phone: null,
  topic: "order",
  order_no: "BV-O-000123",
  message: "Where is my parcel?",
  created_at: "2026-10-22T10:00:00Z",
  handled_at: null,
};
const NOW = new Date("2026-10-23T08:30:00Z");

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe("listContactMessages", () => {
  it("maps rows to inbox messages, newest first and capped", async () => {
    fake.respond("contact_messages", { data: [ROW] });
    expect(await listContactMessages("all")).toEqual([
      {
        id: 7,
        name: "Asha",
        email: "asha@example.com",
        phone: null,
        topic: "order",
        orderNo: "BV-O-000123",
        message: "Where is my parcel?",
        createdAt: "2026-10-22T10:00:00Z",
        handledAt: null,
      },
    ]);
    const query = fake.queriesFor("contact_messages")[0];
    expect(callArgs(query, "order")).toEqual(["created_at", { ascending: false }]);
    expect(callArgs(query, "limit")).toEqual([INBOX_LIMIT]);
    expect(allCalls(query, "is")).toEqual([]);
    expect(allCalls(query, "not")).toEqual([]);
  });

  it("filters open messages to unhandled ones", async () => {
    fake.respond("contact_messages", { data: [] });
    await listContactMessages("open");
    const query = fake.queriesFor("contact_messages")[0];
    expect(callArgs(query, "is")).toEqual(["handled_at", null]);
    expect(callArgs(query, "not")).toBeUndefined();
  });

  it("filters handled messages to those with a handled time", async () => {
    fake.respond("contact_messages", { data: [] });
    await listContactMessages("handled");
    const query = fake.queriesFor("contact_messages")[0];
    expect(callArgs(query, "not")).toEqual(["handled_at", "is", null]);
    expect(callArgs(query, "is")).toBeUndefined();
  });

  it("logs and returns an empty list on error", async () => {
    const error = { message: "rls" };
    fake.respond("contact_messages", { error });
    expect(await listContactMessages("open")).toEqual([]);
    expect(logError).toHaveBeenCalledWith("Failed to list contact messages", error);
  });

  it("exposes the supported filters", () => {
    expect(INBOX_FILTERS).toEqual(["open", "handled", "all"]);
  });
});

describe("setMessageHandled", () => {
  it("stamps the handled time and staff id", async () => {
    fake.respond("contact_messages", { data: [{ id: 7 }] });
    expect(await setMessageHandled(7, true, "staff-1", NOW)).toBe(true);
    const query = fake.queriesFor("contact_messages")[0];
    expect(callArgs(query, "update")).toEqual([{ handled_at: NOW.toISOString(), handled_by: "staff-1" }]);
    expect(callArgs(query, "eq")).toEqual(["id", 7]);
    expect(callArgs(query, "select")).toEqual(["id"]);
  });

  it("clears the handled fields when reopening", async () => {
    fake.respond("contact_messages", { data: [{ id: 7 }] });
    expect(await setMessageHandled(7, false, "staff-1", NOW)).toBe(true);
    expect(callArgs(fake.queriesFor("contact_messages")[0], "update")).toEqual([{ handled_at: null, handled_by: null }]);
  });

  it("returns false when no row was updated", async () => {
    fake.respond("contact_messages", { data: [] });
    expect(await setMessageHandled(99, true, "staff-1", NOW)).toBe(false);
    expect(logError).toHaveBeenCalledWith("Failed to update contact message", null, { id: 99 });
  });

  it("returns false on a database error", async () => {
    const error = { message: "denied" };
    fake.respond("contact_messages", { error });
    expect(await setMessageHandled(7, true, "staff-1", NOW)).toBe(false);
    expect(logError).toHaveBeenCalledWith("Failed to update contact message", error, { id: 7 });
  });
});
