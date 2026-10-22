// Shared with client components, so keep this free of Node-only imports.
export const FEED_FORMATS = ["csv", "xlsx", "json", "xml"] as const;
export type FeedFormat = (typeof FEED_FORMATS)[number];

export const IMPORT_STATUSES = ["running", "succeeded", "partial", "failed"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const FEED_FILE_ACCEPT: Record<FeedFormat, string> = {
  csv: ".csv,text/csv",
  xlsx: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: ".json,application/json",
  xml: ".xml,application/xml,text/xml",
};
