"use client";

import { useEffect, useState } from "react";

/**
 * Time-based progress list for long API calls. Steps advance on a timer and
 * the last one stays active until the request finishes.
 */
export function LoadingSteps({
  steps,
  intervalMs = 6000,
}: {
  steps: string[];
  intervalMs?: number;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((current) => Math.min(current + 1, steps.length - 1));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [steps.length, intervalMs]);

  return (
    <ol className="space-y-3" aria-live="polite">
      {steps.map((step, index) => {
        const done = index < active;
        const current = index === active;
        return (
          <li key={step} className="flex items-center gap-3 text-sm">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                done
                  ? "bg-accent text-white"
                  : current
                    ? "border-2 border-accent border-t-transparent animate-spin"
                    : "border border-blush"
              }`}
              aria-hidden
            >
              {done ? "✓" : null}
            </span>
            <span className={done || current ? "text-ink" : "text-muted"}>
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
