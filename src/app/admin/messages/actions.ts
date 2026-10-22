"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { setMessageHandled } from "@/lib/content/messages";

// Re-checks staff access: the admin layout gate does not run for server actions.
export async function toggleMessageHandledAction(form: FormData): Promise<void> {
  const user = await requireStaff();
  const id = Number(form.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return;
  await setMessageHandled(id, form.get("handled") === "true", user.id, new Date());
  revalidatePath("/admin/messages");
}
