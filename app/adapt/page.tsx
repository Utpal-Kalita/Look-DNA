"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { analyzeSkinTone, ApiError, matchProducts } from "@/app/components/client-api";
import { useFlow } from "@/app/components/FlowProvider";
import { dataUrlToBlob } from "@/app/components/image-utils";
import { categoryLabel, isMakeupCategory } from "@/app/components/labels";
import { RetakeBanner } from "@/app/components/RetakeBanner";
import { ShadeBeforeAfter } from "@/app/components/ShadeBeforeAfter";
import { Spinner } from "@/app/components/Spinner";
import { StepHeader } from "@/app/components/StepHeader";
import { Swatch } from "@/app/components/Swatch";
import { ToneBadge } from "@/app/components/ToneBadge";

type Status =
  | { kind: "loading"; label: string }
  | { kind: "ready" }
  | { kind: "error"; message: string; retakeSelfie: boolean };

export default function AdaptPage() {
  const router = useRouter();
  const { state, hydrated, update } = useFlow();
  const [status, setStatus] = useState<Status>({ kind: "loading", label: "Reading your skin tone…" });
  const running = useRef(false);
  const { selfie, items, userTone, matchResult, budget, excluded } = state;

  const run = useCallback(async () => {
    if (!selfie || items.length === 0 || running.current) {
      return;
    }
    running.current = true;
    try {
      let tone = userTone;
      if (!tone) {
        setStatus({ kind: "loading", label: "Reading your skin tone…" });
        tone = await analyzeSkinTone(await dataUrlToBlob(selfie));
        update({ userTone: tone });
      }
      setStatus({ kind: "loading", label: "Adapting shades and finding pieces…" });
      const result = await matchProducts({ items, userTone: tone, budget, exclude: excluded });
      update({ matchResult: result, matches: result.matches, total: result.total });
      setStatus({ kind: "ready" });
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setStatus({
        kind: "error",
        message: apiError?.message ?? "Something went wrong. Please try again.",
        retakeSelfie: apiError?.code === "FACE_NOT_FOUND" || apiError?.code === "IMAGE_TOO_SMALL",
      });
    } finally {
      running.current = false;
    }
  }, [selfie, items, userTone, budget, excluded, update]);

  useEffect(() => {
    if (!hydrated || !selfie || items.length === 0) {
      return;
    }
    if (userTone && matchResult) {
      setStatus({ kind: "ready" });
    } else {
      void run();
    }
  }, [hydrated, selfie, items.length, userTone, matchResult, run]);

  if (!hydrated) {
    return null;
  }

  if (!selfie || items.length === 0) {
    return (
      <>
        <StepHeader step={4} title="Adapted to you" />
        <RetakeBanner
          tone="error"
          message={!items.length ? "We need your inspiration look first." : "We need your selfie first."}
        />
        <Link
          href={!items.length ? "/" : "/selfie"}
          className="mt-4 block rounded-xl bg-accent py-4 text-center font-semibold text-white"
        >
          {!items.length ? "Upload inspiration" : "Add a selfie"}
        </Link>
      </>
    );
  }

  const makeupTargets = matchResult
    ? Object.entries(matchResult.targets).filter(([category]) => isMakeupCategory(category))
    : [];
  const clothing = matchResult?.matches.filter((m) => !isMakeupCategory(m.category)) ?? [];

  return (
    <>
      <StepHeader
        step={4}
        title="Adapted to you"
        subtitle="Shades tuned to your skin tone, pieces fitted to your budget."
      />

      {status.kind === "loading" ? <Spinner label={status.label} /> : null}

      {status.kind === "error" ? (
        <div className="space-y-3">
          <RetakeBanner tone="error" message={status.message} />
          <button
            type="button"
            onClick={() => (status.retakeSelfie ? router.push("/selfie") : void run())}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white"
          >
            {status.retakeSelfie ? "Retake selfie" : "Try again"}
          </button>
        </div>
      ) : null}

      {status.kind === "ready" && userTone && matchResult ? (
        <div className="space-y-4">
          <ToneBadge tone={userTone} />

          {makeupTargets.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Your shades</h2>
              <ul className="space-y-3">
                {makeupTargets.map(([category, target]) => {
                  const match = matchResult.matches.find((m) => m.category === category);
                  const product = match ? matchResult.products[match.productId] : undefined;
                  return (
                    <ShadeBeforeAfter
                      key={category}
                      category={category}
                      original={target.original}
                      adapted={target.adapted}
                      reason={target.reason}
                      productName={product ? `${product.name} (similar, not identical)` : undefined}
                      productColor={product?.color}
                    />
                  );
                })}
              </ul>
            </section>
          ) : null}

          {clothing.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Your pieces</h2>
              <ul className="space-y-2">
                {clothing.map((match) => {
                  const product = matchResult.products[match.productId];
                  return (
                    <li key={match.category} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                      <Swatch color={product.color} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{product.name}</p>
                        <p className="text-xs text-muted">
                          {categoryLabel(match.category)} · {match.reason}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {matchResult.unmatched.length > 0 ? (
            <p className="text-xs text-muted">
              No in-budget match for: {matchResult.unmatched.map(categoryLabel).join(", ")}.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled={status.kind !== "ready" || !matchResult?.matches.length}
          onClick={() => router.push("/tryon")}
          className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white disabled:opacity-40"
        >
          See it on me
        </button>
        <button type="button" onClick={() => router.push("/dna")} className="mt-2 w-full py-2 text-sm text-muted">
          Back
        </button>
      </div>
    </>
  );
}
