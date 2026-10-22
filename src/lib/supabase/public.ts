import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

// Cookie-free anonymous client for public catalog reads.
// Safe to use inside "use cache" functions because it never touches request data.
export function createPublicClient() {
  const env = publicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
