import Image from "next/image";

interface CategoryImageProps {
  url: string | null;
}

/** Category picture from categories.icon_url; renders nothing when the row has no image. */
export function CategoryImage({ url }: CategoryImageProps) {
  if (!url) return null;
  return (
    <div className="relative mb-3 aspect-square w-full">
      <Image src={url} alt="" fill sizes="(min-width: 640px) 25vw, 50vw" className="object-contain" />
    </div>
  );
}
