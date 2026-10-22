import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

const { groupFaqs, parseFaqRows } = await import("./faqs");

describe("parseFaqRows", () => {
  it("keeps valid rows and falls back to the general topic", () => {
    expect(
      parseFaqRows([
        { id: 1, question: "Q1", answer: "A1", topic: "selling" },
        { id: 2, question: "Q2", answer: "A2", topic: "unknown" },
        { id: "bad" },
      ]),
    ).toEqual([
      { id: 1, question: "Q1", answer: "A1", topic: "selling" },
      { id: 2, question: "Q2", answer: "A2", topic: "general" },
    ]);
    expect(parseFaqRows(null)).toEqual([]);
  });
});

describe("groupFaqs", () => {
  it("groups by topic in a fixed order and drops empty topics", () => {
    const groups = groupFaqs([
      { id: 1, question: "Pay?", answer: "UPI", topic: "payments" },
      { id: 2, question: "Sell?", answer: "Yes", topic: "selling" },
      { id: 3, question: "Pickup?", answer: "Free", topic: "selling" },
    ]);
    expect(groups.map((g) => [g.topic, g.items.map((i) => i.id)])).toEqual([
      ["selling", [2, 3]],
      ["payments", [1]],
    ]);
  });
});
