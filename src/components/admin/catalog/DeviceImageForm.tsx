"use client";

import { startTransition, useActionState, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { uploadDeviceImageAction, type DeviceImageState } from "@/app/admin/catalog/actions";
import { DEVICE_UPLOAD_MAX_BYTES, DEVICE_UPLOAD_TOO_BIG } from "@/lib/catalog/admin-device-list";

interface DeviceImageFormProps {
  deviceId: number;
  deviceName: string;
  imageUrl: string | null;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

/** Current photo plus a picker that replaces it. The server resizes to 192x192 and compresses to 20 KB or less. */
export function DeviceImageForm({ deviceId, deviceName, imageUrl }: DeviceImageFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  // Clear the picker only after a successful save, so a rejected file can be retried or swapped
  const [state, run, pending] = useActionState<DeviceImageState, FormData>(async (prev, data) => {
    const next = await uploadDeviceImageAction(prev, data);
    if (next.done) formRef.current?.reset();
    return next;
  }, {});
  const [localError, setLocalError] = useState<string | null>(null);
  const shown = state.imageUrl ?? imageUrl;

  const onPick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    // Checking here avoids a slow upload that the server would refuse
    setLocalError(file && file.size > DEVICE_UPLOAD_MAX_BYTES ? DEVICE_UPLOAD_TOO_BIG : null);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (localError) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => run(data));
  };

  const error = localError ?? state.error;
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="deviceId" value={deviceId} />
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- 192px admin thumbnail from our storage
        <img src={shown} alt={`${deviceName} photo`} width={64} height={64} className="size-16 shrink-0 rounded bg-background object-contain" />
      ) : (
        <span aria-hidden className="size-16 shrink-0 rounded bg-background" />
      )}
      <input
        type="file"
        name="image"
        accept={ACCEPT}
        required
        onChange={onPick}
        aria-label={`New photo for ${deviceName}`}
        className="min-w-0 max-w-56 text-xs file:mr-2 file:rounded file:border file:border-border file:bg-surface file:px-2 file:py-1 file:text-foreground"
      />
      <button type="submit" disabled={pending} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-contrast disabled:opacity-60">
        {pending ? "Uploading…" : "Upload"}
      </button>
      <p role="status" className="basis-full text-xs empty:hidden">
        {error ? <span className="text-danger">{error}</span> : state.done}
      </p>
    </form>
  );
}
