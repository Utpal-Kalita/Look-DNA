"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { isValidBudget, BudgetInput } from "@/app/components/BudgetInput";
import { CameraCapture } from "@/app/components/CameraCapture";
import { ApiError, checkSelfieQuality } from "@/app/components/client-api";
import { CLEAR_MATCHES, useFlow } from "@/app/components/FlowProvider";
import { cropDataUrl, dataUrlToBlob } from "@/app/components/image-utils";
import { RetakeBanner } from "@/app/components/RetakeBanner";
import { StepHeader } from "@/app/components/StepHeader";
import type { ShopFor } from "@/lib/types";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "retake"; message: string }
  | { kind: "cropped"; message: string }
  | { kind: "error"; message: string };

export default function SelfiePage() {
  const router = useRouter();
  const { state, update } = useFlow();
  const [selfie, setSelfie] = useState<string | null>(state.selfie);
  const [budget, setBudget] = useState<number>(state.budget);
  const [shopFor, setShopFor] = useState<ShopFor>(state.shopFor);
  const [status, setStatus] = useState<Status>(
    state.retakeMessage ? { kind: "retake", message: state.retakeMessage } : { kind: "idle" },
  );

  const checking = status.kind === "checking";
  const canContinue = Boolean(selfie) && isValidBudget(budget) && !checking;

  function onCapture(dataUrl: string | null) {
    setSelfie(dataUrl);
    if (dataUrl) {
      setStatus({ kind: "idle" });
    }
  }

  async function onContinue() {
    if (!selfie || !canContinue) {
      return;
    }
    setStatus({ kind: "checking" });

    try {
      const result = await checkSelfieQuality(await dataUrlToBlob(selfie));
      if (!result.pass) {
        setStatus({ kind: "retake", message: result.message });
        return;
      }
      if (result.crop) {
        // Auto crop: show the framed photo first; the next Continue uses it.
        setSelfie(await cropDataUrl(selfie, result.crop));
        setStatus({ kind: "cropped", message: result.message });
        return;
      }
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "We could not check your selfie. Please try again.";
      // Image-level problems (too small, unreadable) are fixed by retaking.
      const retake =
        error instanceof ApiError && [400, 413, 415, 422].includes(error.status);
      setStatus(retake ? { kind: "retake", message } : { kind: "error", message });
      return;
    }

    const selfieChanged = selfie !== state.selfie;
    update({
      selfie,
      budget,
      retakeMessage: null,
      // A new selfie invalidates results that were computed from the old one.
      ...(selfieChanged ? { userTone: null, tryOn: null, tryOnFor: null } : {}),
      // Adapted shades depend on the tone, and matches on the budget.
      shopFor,
      ...(selfieChanged || budget !== state.budget || shopFor !== state.shopFor ? CLEAR_MATCHES : {}),
    });
    router.push("/dna");
  }

  return (
    <>
      <StepHeader
        step={2}
        title="Now, a photo of you"
        subtitle="Head to hips, facing the camera. Your face gives us your skin tone; your body lets us dress you."
      />

      <CameraCapture value={selfie} onCapture={onCapture} disabled={checking} />

      {status.kind === "retake" ? (
        <div className="mt-4">
          <RetakeBanner message={status.message} />
        </div>
      ) : null}
      {status.kind === "cropped" ? (
        <div className="mt-4">
          <RetakeBanner
            title="Auto cropped"
            message={`${status.message} Tap Continue to use it, or retake if you prefer.`}
          />
        </div>
      ) : null}
      {status.kind === "error" ? (
        <div className="mt-4">
          <RetakeBanner tone="error" message={status.message} />
        </div>
      ) : null}

      <fieldset className="mt-6">
        <legend className="text-sm font-medium">Shop for</legend>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup">
          {(["women", "men"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={shopFor === option}
              onClick={() => setShopFor(option)}
              className={`border py-3 text-sm font-medium ${
                shopFor === option ? "border-accent bg-accent text-white" : "border-blush bg-white"
              }`}
            >
              {option === "women" ? "Women" : "Men"}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        <BudgetInput value={budget} onChange={setBudget} />
      </div>

      <p className="mt-4 text-xs text-muted">
        Your photo is only used to build and preview this look. No account
        needed.
      </p>

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white transition disabled:opacity-40"
        >
          {checking ? "Checking your photo…" : "Continue"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/start")}
          className="mt-2 w-full py-2 text-sm text-muted"
        >
          Back
        </button>
      </div>
    </>
  );
}
