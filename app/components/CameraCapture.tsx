"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fileToJpegDataUrl,
  videoFrameToJpegDataUrl,
} from "@/app/components/image-utils";

/**
 * Keep enough detail to auto crop a small, distant subject. Matches the
 * server's 1920 px limit and stays about 1 MB, well under Vercel's 4.5 MB body.
 */
const PHOTO_MAX_DIMENSION = 1920;

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
      onCapture(videoFrameToJpegDataUrl(video, true, PHOTO_MAX_DIMENSION));
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
      onCapture(await fileToJpegDataUrl(file, PHOTO_MAX_DIMENSION));
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
            <p>Stand back so you fit from head to at least your hips.</p>
            <p>Face the camera in soft, even light, no sunglasses. Prop your phone up or ask a friend.</p>
          </div>
        )}
        {cameraOn ? (
          <div
            className="pointer-events-none absolute inset-[5%_22%_0_22%] border-2 border-b-0 border-white/70"
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
