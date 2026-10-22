import "server-only";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export type UserRole = "customer" | "staff" | "admin";

export interface SessionUser {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
}

/** Signed-in user with their profile, or null. Reads cookies: render inside <Suspense>. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, role")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    logger.error("Profile lookup failed for signed-in user", error, { userId });
    return null;
  }

  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    role: profile.role as UserRole,
  };
}

export async function requireUser(nextPath = "/account"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  // 404 rather than 403 so the admin area is not advertised to customers
  if (user.role !== "staff" && user.role !== "admin") notFound();
  return user;
}
