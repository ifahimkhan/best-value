import Link from "next/link";
import { cartCount } from "@/lib/store/cart";
import { readCart } from "@/lib/store/cart-cookie";

// Reads cookies: must be rendered inside <Suspense>.
export async function CartSlot() {
  const count = cartCount(await readCart());
  return (
    <Link href="/cart" className="relative text-sm font-medium hover:text-brand" aria-label={`Cart, ${count} items`}>
      Cart
      {count > 0 && (
        <span className="absolute -right-4 -top-2 grid size-5 place-items-center rounded-full bg-accent text-xs font-bold text-brand-contrast">
          {count}
        </span>
      )}
    </Link>
  );
}
