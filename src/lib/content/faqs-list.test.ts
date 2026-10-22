import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = await vi.hoisted(async () => (await import("@/test/fake-supabase")).createFakeSupabase());
const mocks = vi.hoisted(() => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), logError: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: mocks.cacheLife, cacheTag: mocks.cacheTag }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.logError, warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => fake.client }));

const { FAQS_TAG, listFaqs } = await import("./faqs");
const { callArgs } = await import("@/test/fake-supabase");

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe("listFaqs", () => {
  it("loads active FAQs in sort order and caches for hours", async () => {
    fake.respond("faqs", {
      data: [
        { id: 1, question: "Q1", answer: "A1", topic: "buying" },
        { id: 2, question: "bad" },
      ],
    });
    expect(await listFaqs()).toEqual([{ id: 1, question: "Q1", answer: "A1", topic: "buying" }]);
    const query = fake.queriesFor("faqs")[0];
    expect(callArgs(query, "eq")).toEqual(["is_active", true]);
    expect(callArgs(query, "order")).toEqual(["sort_order"]);
    expect(mocks.cacheTag).toHaveBeenCalledWith(FAQS_TAG);
    expect(mocks.cacheLife).toHaveBeenCalledWith("hours");
  });

  it("returns an empty list with a short cache life on error", async () => {
    const error = { message: "down" };
    fake.respond("faqs", { error });
    expect(await listFaqs()).toEqual([]);
    expect(mocks.cacheLife).toHaveBeenCalledWith("seconds");
    expect(mocks.cacheLife).not.toHaveBeenCalledWith("hours");
    expect(mocks.logError).toHaveBeenCalledWith("Failed to load FAQs", error);
  });
});
