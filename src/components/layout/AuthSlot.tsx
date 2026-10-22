import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { signOut } from "@/app/login/actions";

// Reads cookies: must be rendered inside <Suspense>.
export async function AuthSlot() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <Link href="/login" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-strong">
        Log in
      </Link>
    );
  }

  const isStaff = user.role === "staff" || user.role === "admin";
  return (
    <div className="flex items-center gap-3 text-sm">
      {isStaff && (
        <Link href="/admin" className="font-medium text-brand hover:underline">
          Admin
        </Link>
      )}
      <Link href="/account" className="font-medium hover:underline">
        {user.fullName ?? "My account"}
      </Link>
      <form action={signOut}>
        <button type="submit" className="text-muted hover:text-foreground">
          Log out
        </button>
      </form>
    </div>
  );
}
