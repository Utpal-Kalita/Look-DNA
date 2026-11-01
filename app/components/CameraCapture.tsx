"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fileToJpegDataUrl,
  videoFrameToJpegDataUrl,
} from "@/app/components/image-utils";

/**
 * Selfie picker: live front camera when available, file upload otherwise.
 * Emits a downscaled JPEG data URL.
 */
export function CameraCapture({
  value,
  onCapture,
  disabled,
}: {
  value: string | null;
  onCapture: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      fileRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      onCapture(null);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      });
    } catch {
      setError("Camera access was blocked. Upload a photo instead.");
    }
  }

  function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      return;
    }
    try {
      onCapture(videoFrameToJpegDataUrl(video, true));
      stopCamera();
    } catch {
      setError("Could not capture the photo. Try again or upload one.");
    }
  }

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (JPEG or PNG).");
      return;
    }
    try {
      stopCamera();
      onCapture(await fileToJpegDataUrl(file));
    } catch {
      setError("We could not read that image. Try a JPEG or PNG.");
    }
  }

  return (
    <div>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-blush">
        {cameraOn ? (
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full -scale-x-100 object-cover"
            aria-label="Camera preview"
          />
        ) : value ? (
          <img src={value} alt="Your selfie" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted">
            <span className="text-4xl" aria-hidden>
              🤳
            </span>
            <p>Face the camera in soft, even light.</p>
            <p>No sunglasses, one face only.</p>
          </div>
        )}
        {cameraOn ? (
          <div
            className="pointer-events-none absolute inset-[15%_20%] rounded-[50%] border-2 border-white/70"
            aria-hidden
          />
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {cameraOn ? (
          <>
            <button
              type="button"
              onClick={stopCamera}
              className="rounded-xl border border-blush bg-white py-3 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={snap}
              className="rounded-xl bg-accent py-3 text-sm font-semibold text-white"
            >
              Take photo
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={startCamera}
              disabled={disabled}
              className="rounded-xl border border-blush bg-white py-3 text-sm font-medium disabled:opacity-50"
            >
              {value ? "Retake" : "Use camera"}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
              className="rounded-xl border border-blush bg-white py-3 text-sm font-medium disabled:opacity-50"
            >
              Upload photo
            </button>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(event) => {
          void onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
