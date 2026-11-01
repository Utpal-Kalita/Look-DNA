export function RetakeBanner({
  message,
  tone = "warning",
  onRetake,
}: {
  message: string;
  tone?: "warning" | "error";
  onRetake?: () => void;
}) {
  const colors =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <div role="alert" className={`rounded-xl border p-3 text-sm ${colors}`}>
      <p className="font-medium">
        {tone === "error" ? "Something went wrong" : "Let's retake that photo"}
      </p>
      <p className="mt-0.5">{message}</p>
      {onRetake ? (
        <button
          type="button"
          onClick={onRetake}
          className="mt-2 font-semibold underline underline-offset-2"
        >
          Retake selfie
        </button>
      ) : null}
    </div>
  );
}
