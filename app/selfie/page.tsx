"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { isValidBudget, BudgetInput } from "@/app/components/BudgetInput";
import { CameraCapture } from "@/app/components/CameraCapture";
import { ApiError, checkSelfieQuality } from "@/app/components/client-api";
import { useFlow } from "@/app/components/FlowProvider";
import { dataUrlToBlob } from "@/app/components/image-utils";
import { RetakeBanner } from "@/app/components/RetakeBanner";
import { StepHeader } from "@/app/components/StepHeader";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "retake"; message: string }
  | { kind: "error"; message: string };

export default function SelfiePage() {
  const router = useRouter();
  const { state, update } = useFlow();
  const [selfie, setSelfie] = useState<string | null>(state.selfie);
  const [budget, setBudget] = useState<number>(state.budget);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

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
      // A new selfie invalidates results that were computed from the old one.
      ...(selfieChanged ? { userTone: null, tryOn: null, tryOnFor: null } : {}),
    });
    router.push("/dna");
  }

  return (
    <>
      <StepHeader
        step={2}
        title="Now, a selfie"
        subtitle="We use it to read your skin tone and show the look on you."
      />

      <CameraCapture value={selfie} onCapture={onCapture} disabled={checking} />

      {status.kind === "retake" ? (
        <div className="mt-4">
          <RetakeBanner message={status.message} />
        </div>
      ) : null}
      {status.kind === "error" ? (
        <div className="mt-4">
          <RetakeBanner tone="error" message={status.message} />
        </div>
      ) : null}

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
          onClick={() => router.push("/")}
          className="mt-2 w-full py-2 text-sm text-muted"
        >
          Back
        </button>
      </div>
    </>
  );
}
