"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, runTryOn } from "@/app/components/client-api";
import { CompareToggle, type CompareView } from "@/app/components/CompareToggle";
import { useFlow } from "@/app/components/FlowProvider";
import { dataUrlToBlob } from "@/app/components/image-utils";
import { LoadingSteps } from "@/app/components/LoadingSteps";
import { RetakeBanner } from "@/app/components/RetakeBanner";
import { StepHeader } from "@/app/components/StepHeader";
import { TryOnViewer } from "@/app/components/TryOnViewer";
import type { ProductMatch } from "@/lib/types";

const LOADING_STEPS = [
  "Preparing your selfie",
  "Dressing you in the matched outfit",
  "Applying your adapted lip shade",
  "Finishing touches",
];

/** Cheap, stable fingerprint of the inputs, so we only re-render when they change. */
function tryOnKey(selfie: string, matches: ProductMatch[]): string {
  const input =
    selfie +
    JSON.stringify(matches.map((m) => [m.productId, m.adaptedColor.toLowerCase()]));
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${input.length}:${(hash >>> 0).toString(16)}`;
}

type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string; retakeSelfie: boolean };

export default function TryOnPage() {
  const router = useRouter();
  const { state, hydrated, update } = useFlow();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [view, setView] = useState<CompareView>("result");
  const inFlight = useRef<string | null>(null);

  const { selfie, matches, tryOn, tryOnFor, inspiration } = state;
  const key = selfie && matches.length > 0 ? tryOnKey(selfie, matches) : null;
  const fresh = Boolean(tryOn && key && tryOnFor === key);

  const start = useCallback(async () => {
    if (!selfie || !key || inFlight.current === key) {
      return;
    }
    inFlight.current = key;
    setStatus({ kind: "loading" });

    try {
      const result = await runTryOn(await dataUrlToBlob(selfie), matches);
      update({ tryOn: result, tryOnFor: key });
      setStatus({ kind: "ready" });
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setStatus({
        kind: "error",
        message:
          apiError?.message ??
          "The try-on could not be created. Please try again.",
        retakeSelfie:
          apiError?.code === "FACE_NOT_FOUND" ||
          apiError?.code === "IMAGE_TOO_SMALL" ||
          apiError?.code === "INVALID_IMAGE",
      });
    } finally {
      inFlight.current = null;
    }
  }, [selfie, key, matches, update]);

  useEffect(() => {
    if (!hydrated || !key) {
      return;
    }
    if (fresh) {
      setStatus({ kind: "ready" });
      return;
    }
    void start();
  }, [hydrated, key, fresh, start]);

  if (!hydrated) {
    return null;
  }

  if (!selfie || matches.length === 0) {
    return (
      <>
        <StepHeader step={5} title="See it on you" />
        <RetakeBanner
          tone="error"
          message={
            !selfie
              ? "We need your selfie before we can show the look on you."
              : "Pick your matched products first, then come back here."
          }
        />
        <Link
          href={!selfie ? "/selfie" : "/adapt"}
          className="mt-4 block w-full rounded-xl bg-accent py-4 text-center font-semibold text-white"
        >
          {!selfie ? "Add a selfie" : "Back to your shades"}
        </Link>
      </>
    );
  }

  return (
    <>
      <StepHeader
        step={5}
        title="See it on you"
        subtitle="The matched outfit and your adapted lip shade on your selfie."
      />

      {status.kind === "loading" ? (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-5 aspect-[3/4] w-full animate-pulse rounded-2xl bg-blush" />
          <LoadingSteps steps={LOADING_STEPS} />
          <p className="mt-4 text-xs text-muted">
            This usually takes 20 to 60 seconds.
          </p>
        </div>
      ) : null}

      {status.kind === "error" ? (
        <div className="space-y-3">
          <RetakeBanner tone="error" message={status.message} />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void start()}
              className="rounded-xl bg-accent py-3 text-sm font-semibold text-white"
            >
              Try again
            </button>
            <Link
              href={status.retakeSelfie ? "/selfie" : "/cart"}
              className="rounded-xl border border-blush bg-white py-3 text-center text-sm font-medium"
            >
              {status.retakeSelfie ? "Retake selfie" : "Skip to cart"}
            </Link>
          </div>
        </div>
      ) : null}

      {status.kind === "ready" && tryOn ? (
        <div className="space-y-4">
          {inspiration ? <CompareToggle value={view} onChange={setView} /> : null}
          <TryOnViewer result={tryOn} inspiration={inspiration} view={view} />
          <p className="text-xs text-muted">
            Virtual preview. Products are similar, not identical, to the
            inspiration.
          </p>
        </div>
      ) : null}

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={() => router.push("/cart")}
          disabled={status.kind === "loading"}
          className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white disabled:opacity-40"
        >
          Shop this look
        </button>
        <button
          type="button"
          onClick={() => router.push("/adapt")}
          className="mt-2 w-full py-2 text-sm text-muted"
        >
          Back
        </button>
      </div>
    </>
  );
}
