"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, extractLook } from "@/app/components/client-api";
import { DnaCard } from "@/app/components/DnaCard";
import { CLEAR_MATCHES, useFlow } from "@/app/components/FlowProvider";
import { dataUrlToBlob } from "@/app/components/image-utils";
import { RetakeBanner } from "@/app/components/RetakeBanner";
import { Spinner } from "@/app/components/Spinner";
import { StepHeader } from "@/app/components/StepHeader";

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

export default function DnaPage() {
  const router = useRouter();
  const { state, hydrated, update } = useFlow();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const running = useRef(false);
  const { inspiration, items } = state;

  const run = useCallback(async () => {
    if (!inspiration || running.current) {
      return;
    }
    running.current = true;
    setStatus({ kind: "loading" });
    try {
      const extracted = await extractLook(await dataUrlToBlob(inspiration));
      update({ items: extracted, ...CLEAR_MATCHES });
      setStatus({ kind: "ready" });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "We could not read this look. Please try again.",
      });
    } finally {
      running.current = false;
    }
  }, [inspiration, update]);

  useEffect(() => {
    if (!hydrated || !inspiration) {
      return;
    }
    if (items.length > 0) {
      setStatus({ kind: "ready" });
    } else {
      void run();
    }
  }, [hydrated, inspiration, items.length, run]);

  if (!hydrated) {
    return null;
  }

  if (!inspiration) {
    return (
      <>
        <StepHeader step={3} title="Your Look DNA" />
        <RetakeBanner tone="error" message="Start by uploading an inspiration image." />
        <Link href="/start" className="mt-4 block rounded-xl bg-accent py-4 text-center font-semibold text-white">
          Upload inspiration
        </Link>
      </>
    );
  }

  const empty = status.kind === "ready" && items.length === 0;

  return (
    <>
      <StepHeader
        step={3}
        title="Your Look DNA"
        subtitle="The pieces, colours and style we found in your inspiration."
      />

      {status.kind === "loading" ? <Spinner label="Reading the look…" /> : null}

      {status.kind === "error" ? (
        <div className="space-y-3">
          <RetakeBanner tone="error" message={status.message} />
          <button
            type="button"
            onClick={() => void run()}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      ) : null}

      {empty ? (
        <RetakeBanner
          tone="error"
          message="We could not find clothing or makeup in this image. Try a clearer photo of an outfit or a makeup look."
        />
      ) : null}

      {status.kind === "ready" && items.length > 0 ? <DnaCard items={items} image={inspiration} /> : null}

      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled={status.kind !== "ready" || items.length === 0}
          onClick={() => router.push("/adapt")}
          className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white disabled:opacity-40"
        >
          Adapt it to me
        </button>
        <button type="button" onClick={() => router.push(empty ? "/start" : "/selfie")} className="mt-2 w-full py-2 text-sm text-muted">
          {empty ? "Use another image" : "Back"}
        </button>
      </div>
    </>
  );
}
