/** Result shown under a staff action form. */
export interface AdminActionState {
  error?: string;
  done?: string;
}

export const STALE_MESSAGE = "This order changed while you were looking at it. Reload the page and try again.";

export function orderNoFrom(form: FormData): string | null {
  const orderNo = form.get("orderNo");
  return typeof orderNo === "string" && orderNo.length > 0 && orderNo.length <= 40 ? orderNo : null;
}
