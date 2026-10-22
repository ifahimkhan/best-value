import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS } from "./mapping";
import { parseImportRuns, parseMappingForm, parseSupplierForm, parseSupplierRow } from "./suppliers";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(entries).forEach(([key, value]) => data.append(key, value));
  return data;
}

describe("parseSupplierForm", () => {
  it("accepts a supplier with a daily https feed", () => {
    expect(
      parseSupplierForm(form({ name: " Acme ", feedUrl: "https://acme.example.com/feed.csv", feedFormat: "csv", scheduled: "on", isActive: "on" })),
    ).toEqual({
      ok: true,
      data: { name: "Acme", feed_url: "https://acme.example.com/feed.csv", feed_format: "csv", schedule_cron: "daily", is_active: true },
    });
  });

  it("allows upload-only suppliers", () => {
    const result = parseSupplierForm(form({ name: "Acme", feedUrl: "", feedFormat: "xlsx" }));
    expect(result).toMatchObject({ ok: true, data: { feed_url: null, schedule_cron: null, is_active: false } });
  });

  it("rejects unsafe URLs, bad formats and schedules without a URL", () => {
    expect(parseSupplierForm(form({ name: "A", feedUrl: "http://acme.example.com", feedFormat: "csv" }))).toMatchObject({
      ok: false,
      errors: { feedUrl: expect.stringContaining("https") },
    });
    expect(parseSupplierForm(form({ name: "", feedUrl: "", feedFormat: "pdf" }))).toMatchObject({
      ok: false,
      errors: { name: expect.any(String), feedFormat: expect.any(String) },
    });
    expect(parseSupplierForm(form({ name: "A", feedUrl: "", feedFormat: "csv", scheduled: "on" }))).toMatchObject({
      ok: false,
      errors: { scheduled: expect.any(String) },
    });
  });
});

describe("parseMappingForm", () => {
  it("builds a mapping from the editor fields", () => {
    const result = parseMappingForm(
      form({
        "field.sku": "Code",
        "field.title": "Name",
        "field.price": "Price",
        "field.mrp": "",
        missing: "zero_stock",
        defaultCondition: "refurbished_good",
        defaultGstRate: "12",
        markupPercent: "7.5",
      }),
    );
    expect(result).toEqual({
      ok: true,
      mapping: {
        fields: { sku: "Code", title: "Name", price: "Price" },
        options: { missing: "zero_stock", defaultCondition: "refurbished_good", defaultGstRate: 12, markupPercent: 7.5 },
      },
    });
  });

  it("requires SKU, title and price", () => {
    const result = parseMappingForm(form({ "field.sku": "Code" }));
    expect(result).toEqual({ ok: false, error: "Choose a column for: Title, Price (incl. GST)" });
  });
});

describe("row parsers", () => {
  it("parses a supplier row and its stored mapping", () => {
    expect(
      parseSupplierRow({
        id: 1,
        name: "Acme",
        feed_url: null,
        feed_format: "json",
        field_mapping: {},
        schedule_cron: null,
        is_active: true,
        last_run_at: null,
      }),
    ).toEqual({
      id: 1,
      name: "Acme",
      feedUrl: null,
      feedFormat: "json",
      mapping: { fields: {}, options: DEFAULT_OPTIONS },
      scheduled: false,
      isActive: true,
      lastRunAt: null,
    });
    expect(parseSupplierRow({ id: "x" })).toBeNull();
  });

  it("parses import runs and tolerates odd error entries", () => {
    const runs = parseImportRuns([
      {
        id: 4,
        status: "partial",
        rows_total: 3,
        rows_created: 1,
        rows_updated: 1,
        rows_failed: 1,
        errors: [{ row: 3, sku: null, field: "price", message: "Price is not a valid amount" }, { row: "bad" }],
        started_at: "2026-10-22T10:00:00Z",
        finished_at: null,
      },
    ]);
    expect(runs[0].errors).toEqual([
      { row: 3, sku: null, field: "price", message: "Price is not a valid amount" },
      { row: null, sku: null, field: null, message: "Unknown error" },
    ]);
    expect(parseImportRuns("nope")).toEqual([]);
  });
});
