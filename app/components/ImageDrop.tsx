"use client";

import { useEffect, useRef, useState } from "react";

import { fileToJpegDataUrl } from "@/app/components/image-utils";

/** Upload, drag-and-drop or paste an inspiration image. Emits a JPEG data URL. */
export function ImageDrop({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept(file: File | undefined | null) {
    setError(null);
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("That is not an image. Use a JPEG, PNG or screenshot.");
      return;
    }
    setBusy(true);
    try {
      onChange(await fileToJpegDataUrl(file));
    } catch {
      setError("We could not read that image. Try another one.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = [...(event.clipboardData?.files ?? [])].find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) {
        event.preventDefault();
        void accept(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void accept(event.dataTransfer.files[0]);
        }}
        className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition ${
          dragging ? "border-accent bg-blush" : "border-blush bg-white"
        }`}
        aria-label={value ? "Change inspiration image" : "Upload inspiration image"}
      >
        {value ? (
          <img src={value} alt="Your inspiration" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted">
            <span className="text-4xl" aria-hidden>
              ✨
            </span>
            <span className="font-medium text-ink">
              {busy ? "Reading image…" : "Tap to upload a look you love"}
            </span>
            <span>A screenshot from Instagram or Pinterest works great.</span>
            <span className="hidden sm:inline">You can also drop or paste an image.</span>
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void accept(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
