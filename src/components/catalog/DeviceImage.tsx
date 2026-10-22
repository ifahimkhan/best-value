import Image from "next/image";

interface DeviceImageProps {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
}

// Square image box. Falls back to a lettered tile when a device has no photo yet.
export function DeviceImage({ src, alt, sizes, priority = false }: DeviceImageProps) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-background">
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-contain p-3" />
      ) : (
        <div aria-hidden className="grid h-full place-items-center text-3xl font-bold text-muted">
          {alt.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}
