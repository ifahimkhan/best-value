import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

// Service-role client: BYPASSES RLS. Server-only, never import in client code.
// Use only after the caller has been authorised (e.g. requireStaff) or for
// writes the server must own, such as inserting orders with server-computed prices.
export function createAdminClient() {
  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
