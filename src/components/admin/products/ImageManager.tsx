"use client";

import { useState } from "react";

interface ImageManagerProps {
  initial: readonly string[];
  max: number;
  error?: string;
}

const BUTTON = "rounded border border-border px-2 py-0.5 text-xs hover:bg-brand-soft disabled:opacity-40";

/** Saved images (kept in order via hidden inputs) plus a picker for new uploads. */
export function ImageManager({ initial, max, error }: ImageManagerProps) {
  const [images, setImages] = useState<string[]>([...initial]);

  const move = (index: number, delta: number): void => {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    setImages(images.map((url, i) => (i === index ? images[target] : i === target ? images[index] : url)));
  };

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 font-semibold">Images</legend>
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((url, index) => (
            <li key={url} className="space-y-2 rounded-lg border border-border p-2">
              <input type="hidden" name="image" value={url} />
              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of our own storage */}
              <img src={url} alt={`Product image ${index + 1}`} className="aspect-square w-full rounded object-contain" />
              <div className="flex flex-wrap gap-1">
                <button type="button" className={BUTTON} onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move earlier">
                  ←
                </button>
                <button type="button" className={BUTTON} onClick={() => move(index, 1)} disabled={index === images.length - 1} aria-label="Move later">
                  →
                </button>
                <button type="button" className={BUTTON} onClick={() => setImages(images.filter((u) => u !== url))}>
                  Remove
                </button>
              </div>
              {index === 0 && <p className="text-xs text-muted">Main image</p>}
            </li>
          ))}
        </ul>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Add images</span>
        <input
          type="file"
          name="newImages"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          disabled={images.length >= max}
          className="block text-sm"
        />
        <span className="mt-1 block text-xs text-muted">
          JPEG, PNG, WebP, GIF or AVIF, up to 5 MB each and 4 MB per save. {images.length} of {max} used.
        </span>
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
    </fieldset>
  );
}
