import { beforeEach, describe, expect, it, vi } from "vitest";

const excel = vi.hoisted(() => ({ readSheet: vi.fn<(data: Buffer) => Promise<unknown[][]>>() }));

vi.mock("server-only", () => ({}));
vi.mock("read-excel-file/node", () => ({ readSheet: excel.readSheet }));

const { parseXlsxFeed } = await import("./parse-xlsx");

/** Minimal zip layout that passes the zip-bomb guard: local header, one directory entry, end record. */
function workbook(uncompressed = 1000): Buffer {
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  const entry = Buffer.alloc(47);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt32LE(uncompressed, 24);
  entry.writeUInt16LE(1, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(entry.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, entry, end]);
}

beforeEach(() => {
  excel.readSheet.mockReset();
});

describe("parseXlsxFeed", () => {
  it("turns the first worksheet into a feed table", async () => {
    excel.readSheet.mockResolvedValue([
      [null, null],
      ["SKU", "Price"],
      ["A1", 199],
      [null, ""],
      ["B2", 249.5],
    ]);
    const data = workbook();

    const result = await parseXlsxFeed(data);

    expect(excel.readSheet).toHaveBeenCalledWith(data);
    expect(result).toEqual({
      ok: true,
      table: { columns: ["SKU", "Price"], rows: [{ SKU: "A1", Price: "199" }, { SKU: "B2", Price: "249.5" }] },
    });
  });

  it("refuses non-zip data before reading it", async () => {
    const result = await parseXlsxFeed(Buffer.from("sku,price\nA,1\n".repeat(5)));

    expect(result).toEqual({ ok: false, error: "The file is not a valid Excel (.xlsx) workbook." });
    expect(excel.readSheet).not.toHaveBeenCalled();
  });

  it("refuses zip bombs before reading them", async () => {
    const result = await parseXlsxFeed(workbook(0xffffffff));

    expect(result).toMatchObject({ ok: false, error: "The workbook is too large." });
    expect(excel.readSheet).not.toHaveBeenCalled();
  });

  it("maps reader failures to a friendly error", async () => {
    excel.readSheet.mockRejectedValue(new Error("invalid sheet XML at /xl/worksheets/sheet1.xml"));

    await expect(parseXlsxFeed(workbook())).resolves.toEqual({ ok: false, error: "The file is not a valid Excel (.xlsx) workbook." });
  });

  it("reports a sheet with a header but no rows", async () => {
    excel.readSheet.mockResolvedValue([["SKU", "Price"]]);

    await expect(parseXlsxFeed(workbook())).resolves.toEqual({ ok: false, error: "The file has a header but no product rows." });
  });
});
