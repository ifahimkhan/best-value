import { XMLParser } from "fast-xml-parser";
import Papa from "papaparse";

export const MAX_ROWS = 20_000;
export const MAX_COLUMNS = 200;
const MAX_CELL_LENGTH = 10_000;
const MAX_DEPTH = 6;
const TOO_MANY_ROWS = `The file has more than ${MAX_ROWS.toLocaleString("en-IN")} rows.`;
const UNSAFE_KEYS =new Set(["__proto__", "constructor", "prototype"]);

export type FeedRow = Readonly<Record<string, string>>;

export interface FeedTable {
  columns: string[];
  rows: FeedRow[];
}

export type ParseResult = { ok: true; table: FeedTable } | { ok: false; error: string };

export type TextFeedFormat = "csv" | "json" | "xml";

export function parseTextFeed(text: string, format: TextFeedFormat): ParseResult {
  const input = text.replace(/^﻿/, "");
  if (input.trim() === "") return { ok: false, error: "The file is empty." };
  try {
    if (format === "csv") return parseCsv(input);
    if (format === "json") return parseJson(input);
    return parseXml(input);
  } catch {
    return { ok: false, error: `The file is not valid ${format.toUpperCase()}.` };
  }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  return String(value).trim().slice(0, MAX_CELL_LENGTH);
}

function isBlankRow(row: readonly unknown[]): boolean {
  return row.every((cell) => cellText(cell) === "");
}

function headerNames(raw: readonly unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((cell, index) => {
    const base = cellText(cell).slice(0, 100) || `Column ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function checkSize(columns: readonly string[], rowCount: number): ParseResult | null {
  if (columns.length === 0) return { ok: false, error: "No columns were found." };
  if (columns.length > MAX_COLUMNS) return { ok: false, error: `The file has more than ${MAX_COLUMNS} columns.` };
  if (rowCount === 0) return { ok: false, error: "The file has a header but no product rows." };
  if (rowCount > MAX_ROWS) return { ok: false, error: TOO_MANY_ROWS };
  return null;
}

/** Spreadsheet-style rows (CSV, XLSX): first non-blank row is the header. */
export function tableFromMatrix(matrix: readonly (readonly unknown[])[]): ParseResult {
  const headerIndex = matrix.findIndex((row) => !isBlankRow(row));
  if (headerIndex === -1) return { ok: false, error: "The file is empty." };
  const columns = headerNames(matrix[headerIndex]);
  const body = matrix.slice(headerIndex + 1).filter((row) => !isBlankRow(row));
  const problem = checkSize(columns, body.length);
  if (problem) return problem;
  // Object.fromEntries defines own properties, so a "__proto__" header cannot touch the prototype
  const rows = body.map((row) => Object.fromEntries(columns.map((column, i) => [column, cellText(row[i])])));
  return { ok: true, table: { columns, rows } };
}

function parseCsv(text: string): ParseResult {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimitersToGuess: [",", ";", "\t", "|"] });
  return tableFromMatrix(result.data);
}

type Flat = Map<string, string>;

function flatten(value: unknown, prefix: string, out: Flat, depth: number): void {
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(value)) {
    const parts = value.filter((v) => v === null || typeof v !== "object").map(cellText).filter(Boolean);
    if (prefix) out.set(prefix, parts.join("|").slice(0, MAX_CELL_LENGTH));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (UNSAFE_KEYS.has(key)) continue;
      flatten(child, prefix ? `${prefix}.${key}` : key, out, depth + 1);
    }
    return;
  }
  if (prefix) out.set(prefix, cellText(value));
}

function tableFromRecords(records: readonly unknown[]): ParseResult {
  if (records.length > MAX_ROWS) return { ok: false, error: TOO_MANY_ROWS };
  const flats = records.map((record) => {
    const out: Flat = new Map();
    flatten(record, "", out, 0);
    return out;
  });
  const columns = [...new Set(flats.flatMap((flat) => [...flat.keys()]))];
  const problem = checkSize(columns, flats.length);
  if (problem) return problem;
  const rows = flats.map((flat) => Object.fromEntries(columns.map((column) => [column, flat.get(column) ?? ""])));
  return { ok: true, table: { columns, rows } };
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => v !== null && typeof v === "object" && !Array.isArray(v));
}

/** Breadth-first search for the first array of objects, e.g. { data: { products: [...] } }. */
function findRecordArray(root: unknown): unknown[] | null {
  const queue: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  for (let i = 0; i < queue.length; i += 1) {
    const { value, depth } = queue[i];
    if (isRecordArray(value)) return value;
    if (depth >= MAX_DEPTH || value === null || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [key, child] of Object.entries(value)) {
      if (!UNSAFE_KEYS.has(key)) queue.push({ value: child, depth: depth + 1 });
    }
  }
  return null;
}

function parseJson(text: string): ParseResult {
  const records = findRecordArray(JSON.parse(text) as unknown);
  if (!records) return { ok: false, error: "No list of products was found in the JSON." };
  return tableFromRecords(records);
}

/** The biggest array of elements anywhere in the document is taken to be the product list. */
function largestRecordArray(root: unknown, depth = 0): unknown[] | null {
  if (depth > MAX_DEPTH || root === null || typeof root !== "object") return null;
  let best: unknown[] | null = isRecordArray(root) ? root : null;
  const children = Array.isArray(root) ? root : Object.values(root);
  for (const child of children) {
    const found = largestRecordArray(child, depth + 1);
    if (found && (!best || found.length > best.length)) best = found;
  }
  return best;
}

function parseXml(text: string): ParseResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    ignoreDeclaration: true,
    ignorePiTags: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    // Entity expansion off: blocks "billion laughs" and external entity tricks
    processEntities: false,
    htmlEntities: false,
  });
  const doc = parser.parse(text) as unknown;
  const records = largestRecordArray(doc);
  if (!records) return { ok: false, error: "No repeating product elements were found in the XML." };
  return tableFromRecords(records);
}
