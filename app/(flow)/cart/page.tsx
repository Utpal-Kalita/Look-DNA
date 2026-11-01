"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BudgetBar } from "@/app/components/BudgetBar";
import { CartItem } from "@/app/components/CartItem";
import { ApiError, matchProducts } from "@/app/components/client-api";
import { useFlow } from "@/app/components/FlowProvider";
import { categoryLabel } from "@/app/components/labels";
import { RetakeBanner } from "@/app/components/RetakeBanner";
import { StepHeader } from "@/app/components/StepHeader";

export default function CartPage() {
  const router = useRouter();
  const { state, hydrated, update, reset } = useFlow();
  const [swapping, setSwapping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { matchResult, items, userTone, budget, excluded } = state;

  if (!hydrated) {
    return null;
  }

  if (!matchResult || matchResult.matches.length === 0) {
    return (
      <>
        <StepHeader step={6} title="Your cart" />
        <RetakeBanner tone="error" message="There is nothing in your cart yet. Build a look first." />
        <Link href="/start" className="mt-4 block rounded-xl bg-accent py-4 text-center font-semibold text-white">
          Start a look
        </Link>
      </>
    );
  }

  async function swap(category: string, productId: string) {
    setSwapping(category);
    setError(null);
    const nextExcluded = [...new Set([...excluded, productId])];
    try {
      const result = await matchProducts({ items, userTone, budget, exclude: nextExcluded });
      update({
        matchResult: result,
        matches: result.matches,
        total: result.total,
        excluded: nextExcluded,
      });
    } catch (swapError) {
      setError(
        swapError instanceof ApiError ? swapError.message : "Could not swap that item. Please try again.",
      );
    } finally {
      setSwapping(null);
    }
  }

  return (
    <>
      <StepHeader
        step={6}
        title="Your cart"
        subtitle="Every piece is a close match from our catalog: similar, not identical."
      />

      <div className="space-y-4">
        <BudgetBar total={matchResult.total} budget={budget} />

        {error ? <RetakeBanner tone="error" message={error} /> : null}

        <ul className="space-y-3">
          {matchResult.matches.map((match) => (
            <CartItem
              key={match.category}
              match={match}
              product={matchResult.products[match.productId]}
              canSwap={Boolean(matchResult.canSwap[match.category])}
              swapping={swapping === match.category}
              onSwap={() => void swap(match.category, match.productId)}
            />
          ))}
        </ul>

        {matchResult.unmatched.length > 0 ? (
          <p className="text-xs text-muted">
            Left out to stay in budget or no close match: {matchResult.unmatched.map(categoryLabel).join(", ")}.
          </p>
        ) : null}
      </div>

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={() => router.push("/tryon")}
          className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white"
        >
          See this cart on me
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            router.push("/start");
          }}
          className="mt-2 w-full py-2 text-sm text-muted"
        >
          Start a new look
        </button>
      </div>
    </>
  );
}
