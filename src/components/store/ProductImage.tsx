import Image from "next/image";

interface ProductImageProps {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
}

// Images in our own Supabase storage go through the Next.js optimizer.
// Feed images from other hosts are shown as-is (the optimizer only allows
// our storage host, so it can't be abused as a free resizing proxy).
function isOwnStorage(src: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(base) && src.startsWith(`${base}/storage/v1/object/public/`);
}

export function ProductImage({ src, alt, sizes, priority = false }: ProductImageProps) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-background">
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={!isOwnStorage(src)}
          className="object-contain p-3"
        />
      ) : (
        <div aria-hidden className="grid h-full place-items-center text-3xl font-bold text-muted">
          {alt.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}
