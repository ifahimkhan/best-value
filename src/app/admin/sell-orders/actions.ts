"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { getSellOrder, saveSellInternal, updateSellOrder } from "@/lib/admin/sell-orders";
import { orderNoFrom, STALE_MESSAGE, type AdminActionState } from "@/lib/admin/action-state";
import { dbErrorMessage, parseSellInternalForm, parseSellTransition } from "@/lib/admin/transitions";

// Every action re-checks staff access: the admin layout gate does not run for server actions.

async function loadOrder(form: FormData) {
  const orderNo = orderNoFrom(form);
  return orderNo ? getSellOrder(orderNo) : null;
}

export async function transitionSellOrderAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  await requireStaff();
  const order = await loadOrder(form);
  if (!order) return { error: "Unknown order." };
  const parsed = parseSellTransition(form, order.status);
  if (!parsed.ok) return { error: parsed.error };
  const result = await updateSellOrder(order.id, order.status, parsed.update);
  if (!result.ok) return { error: result.message === "stale" ? STALE_MESSAGE : dbErrorMessage(result.message) };
  revalidatePath(`/admin/sell-orders/${order.orderNo}`);
  return { done: "Order updated." };
}

export async function saveSellNotesAction(_prev: AdminActionState, form: FormData): Promise<AdminActionState> {
  await requireStaff();
  const order = await loadOrder(form);
  if (!order) return { error: "Unknown order." };
  const parsed = parseSellInternalForm(form);
  if (!parsed.ok) return { error: parsed.error };
  if (!(await saveSellInternal(order.id, parsed.data))) return { error: "The notes could not be saved. Please try again." };
  revalidatePath(`/admin/sell-orders/${order.orderNo}`);
  return { done: "Saved." };
}
