import "server-only";
import { readSheet } from "read-excel-file/node";
import { tableFromMatrix, type ParseResult } from "./parse";
import { checkZipLimits } from "./zip-guard";

/** Reads the first worksheet of an .xlsx file. */
export async function parseXlsxFeed(data: Buffer): Promise<ParseResult> {
  const zip = checkZipLimits(data);
  if (!zip.ok) return zip;
  try {
    const matrix = await readSheet(data);
    return tableFromMatrix(matrix);
  } catch {
    return { ok: false, error: "The file is not a valid Excel (.xlsx) workbook." };
  }
}
