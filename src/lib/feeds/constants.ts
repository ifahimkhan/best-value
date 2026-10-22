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

/** Product columns a feed import may overwrite; staff can lock each one. */
export const LOCKABLE_FIELDS = {
  title: "Title",
  description: "Description",
  condition: "Condition",
  brand_id: "Brand",
  category_id: "Category",
  mrp: "MRP",
  price: "Price",
  gst_rate: "GST rate",
  hsn_code: "HSN code",
  stock: "Stock",
  images: "Images",
  is_active: "Active",
} as const;
export type LockableField = keyof typeof LOCKABLE_FIELDS;
export const LOCKABLE_FIELD_KEYS = Object.keys(LOCKABLE_FIELDS) as LockableField[];
