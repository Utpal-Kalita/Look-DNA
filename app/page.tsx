"use client";

import { useRouter } from "next/navigation";

import { CLEAR_LOOK, useFlow } from "@/app/components/FlowProvider";
import { ImageDrop } from "@/app/components/ImageDrop";
import { StepHeader } from "@/app/components/StepHeader";

export default function InspirationPage() {
  const router = useRouter();
  const { state, update } = useFlow();

  return (
    <>
      <p className="mb-4 text-sm font-semibold tracking-wide text-accent">Look DNA</p>
      <StepHeader
        step={1}
        title="Screenshot any look"
        subtitle="We find the pieces, adapt the shades to your skin tone, fit it to your budget, and show it on you."
      />

      <ImageDrop
        value={state.inspiration}
        onChange={(inspiration) => {
          if (inspiration !== state.inspiration) {
            update({ inspiration, ...CLEAR_LOOK });
          }
        }}
      />

      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled={!state.inspiration}
          onClick={() => router.push("/selfie")}
          className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white disabled:opacity-40"
        >
          Continue
        </button>
        <p className="mt-3 text-center text-xs text-muted">
          Products come from our curated catalog and are similar, not identical, to the look.
        </p>
      </div>
    </>
  );
}
