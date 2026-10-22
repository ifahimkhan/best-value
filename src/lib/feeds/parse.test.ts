import { describe, expect, it } from "vitest";
import { MAX_ROWS, parseTextFeed, tableFromMatrix } from "./parse";

describe("parseTextFeed csv", () => {
  it("reads headers and rows, trimming cells and skipping blank lines", () => {
    const csv = "Item Code, Name ,Price\nA1,Phone, 1299\n\nA2,\"Case, black\",99\n";
    expect(parseTextFeed(csv, "csv")).toEqual({
      ok: true,
      table: {
        columns: ["Item Code", "Name", "Price"],
        rows: [
          { "Item Code": "A1", Name: "Phone", Price: "1299" },
          { "Item Code": "A2", Name: "Case, black", Price: "99" },
        ],
      },
    });
  });

  it("strips a UTF-8 BOM and supports semicolons", () => {
    const result = parseTextFeed("﻿sku;price\nA;1", "csv");
    expect(result.ok && result.table.columns).toEqual(["sku", "price"]);
  });

  it("rejects an empty file", () => {
    expect(parseTextFeed("", "csv")).toMatchObject({ ok: false });
  });
});

describe("parseTextFeed json", () => {
  it("accepts a top-level array and flattens nested objects with dots", () => {
    const json = JSON.stringify([{ sku: "A", price: 10, specs: { ram: "8GB" }, tags: ["x", "y"] }]);
    expect(parseTextFeed(json, "json")).toEqual({
      ok: true,
      table: {
        columns: ["sku", "price", "specs.ram", "tags"],
        rows: [{ sku: "A", price: "10", "specs.ram": "8GB", tags: "x|y" }],
      },
    });
  });

  it("finds the product array inside a wrapper object", () => {
    const json = JSON.stringify({ meta: { count: 1 }, data: { products: [{ sku: "A" }] } });
    expect(parseTextFeed(json, "json")).toMatchObject({ ok: true, table: { rows: [{ sku: "A" }] } });
  });

  it("reports invalid JSON", () => {
    expect(parseTextFeed("{", "json")).toMatchObject({ ok: false });
  });

  it("ignores prototype-polluting keys", () => {
    const result = parseTextFeed('[{"sku":"A","__proto__":{"x":1}}]', "json");
    expect(result.ok && result.table.columns).toEqual(["sku"]);
  });
});

describe("parseTextFeed xml", () => {
  it("uses the repeating element as rows, including attributes", () => {
    const xml = `<?xml version="1.0"?>
      <catalog><product id="A1"><name>Phone</name><price>1299</price></product>
      <product id="A2"><name>Case</name><price>99</price></product></catalog>`;
    expect(parseTextFeed(xml, "xml")).toEqual({
      ok: true,
      table: {
        columns: ["name", "price", "id"],
        rows: [
          { id: "A1", name: "Phone", price: "1299" },
          { id: "A2", name: "Case", price: "99" },
        ],
      },
    });
  });

  it("does not expand entities", () => {
    const xml = `<!DOCTYPE x [<!ENTITY a "boom">]><items><item><name>&a;</name></item><item><name>b</name></item></items>`;
    const result = parseTextFeed(xml, "xml");
    expect(JSON.stringify(result)).not.toContain("boom");
  });
});

describe("tableFromMatrix", () => {
  it("turns spreadsheet rows into records using the first non-empty row as headers", () => {
    expect(
      tableFromMatrix([
        [null, null],
        ["SKU", "Price"],
        ["A", 12.5],
        [null, null],
        ["B", new Date("2026-01-02T00:00:00Z")],
      ]),
    ).toEqual({
      ok: true,
      table: {
        columns: ["SKU", "Price"],
        rows: [
          { SKU: "A", Price: "12.5" },
          { SKU: "B", Price: "2026-01-02" },
        ],
      },
    });
  });

  it("de-duplicates and fills blank header names", () => {
    const result = tableFromMatrix([["Name", "Name", ""], ["a", "b", "c"]]);
    expect(result.ok && result.table.columns).toEqual(["Name", "Name (2)", "Column 3"]);
  });

  it("caps the number of rows", () => {
    const matrix = [["sku"], ...Array.from({ length: MAX_ROWS + 5 }, (_, i) => [`S${i}`])];
    expect(tableFromMatrix(matrix)).toMatchObject({ ok: false });
  });
});
