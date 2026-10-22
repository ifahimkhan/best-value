// An .xlsx file is a zip archive. A tiny crafted archive can inflate to
// gigabytes ("zip bomb"), so read the central directory and refuse archives
// whose declared contents are too big before handing them to the parser.

export const MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 300;

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;

export type ZipCheck = { ok: true } | { ok: false; error: string };

function findEndOfDirectory(data: Buffer): number {
  const stop = Math.max(0, data.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let i = data.length - EOCD_MIN_SIZE; i >= stop; i -= 1) {
    if (data.readUInt32LE(i) === END_OF_DIRECTORY) return i;
  }
  return -1;
}

export function checkZipLimits(data: Buffer): ZipCheck {
  const invalid: ZipCheck = { ok: false, error: "The file is not a valid Excel (.xlsx) workbook." };
  if (data.length < EOCD_MIN_SIZE || data.readUInt32LE(0) !== LOCAL_HEADER) return invalid;
  const eocd = findEndOfDirectory(data);
  if (eocd === -1) return invalid;

  const entries = data.readUInt16LE(eocd + 10);
  const directoryOffset = data.readUInt32LE(eocd + 16);
  // ZIP64 markers: no spreadsheet we accept needs them
  if (entries === 0xffff || directoryOffset === 0xffffffff) return { ok: false, error: "The workbook is too large." };
  if (entries > MAX_ZIP_ENTRIES) return { ok: false, error: "The workbook has too many parts." };

  let offset = directoryOffset;
  let total = 0;
  for (let i = 0; i < entries; i += 1) {
    if (offset + 46 > data.length || data.readUInt32LE(offset) !== CENTRAL_HEADER) return invalid;
    const uncompressed = data.readUInt32LE(offset + 24);
    if (uncompressed === 0xffffffff) return { ok: false, error: "The workbook is too large." };
    total += uncompressed;
    if (total > MAX_UNCOMPRESSED_BYTES) return { ok: false, error: "The workbook is too large once unpacked." };
    offset += 46 + data.readUInt16LE(offset + 28) + data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32);
  }
  return { ok: true };
}
