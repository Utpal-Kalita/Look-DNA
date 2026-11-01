"use client";

const PRESETS = [1500, 3000, 5000, 8000];
const MIN_BUDGET = 500;
const MAX_BUDGET = 50000;

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatInr(amount: number): string {
  return inr.format(amount);
}

export function isValidBudget(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_BUDGET && value <= MAX_BUDGET;
}

export function BudgetInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const invalid = !isValidBudget(value);

  return (
    <fieldset>
      <legend className="text-sm font-medium">Your budget for the full look</legend>
      <div className="mt-2 flex items-center rounded-xl border border-blush bg-white px-3 focus-within:border-accent">
        <span className="text-muted" aria-hidden>
          ₹
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={MIN_BUDGET}
          max={MAX_BUDGET}
          step={100}
          value={Number.isFinite(value) ? value : ""}
          onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
          aria-label="Budget in rupees"
          aria-invalid={invalid}
          className="w-full bg-transparent px-2 py-3 text-lg outline-none"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            aria-pressed={value === preset}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              value === preset
                ? "border-accent bg-accent text-white"
                : "border-blush bg-white"
            }`}
          >
            {formatInr(preset)}
          </button>
        ))}
      </div>
      {invalid ? (
        <p className="mt-1 text-xs text-red-700">
          Enter a budget between {formatInr(MIN_BUDGET)} and{" "}
          {formatInr(MAX_BUDGET)}.
        </p>
      ) : null}
    </fieldset>
  );
}
