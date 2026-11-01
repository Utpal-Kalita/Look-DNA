"use client";

export type CompareView = "result" | "compare";

export function CompareToggle({
  value,
  onChange,
}: {
  value: CompareView;
  onChange: (value: CompareView) => void;
}) {
  const options: { id: CompareView; label: string }[] = [
    { id: "result", label: "Your look" },
    { id: "compare", label: "Compare" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Try-on view"
      className="grid grid-cols-2 rounded-xl bg-blush p-1 text-sm"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-lg py-2 font-medium transition ${
            value === option.id ? "bg-white shadow-sm" : "text-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
