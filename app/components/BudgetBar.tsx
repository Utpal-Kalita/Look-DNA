import { formatInr } from "@/app/components/BudgetInput";

export function BudgetBar({ total, budget }: { total: number; budget: number }) {
  const ratio = budget > 0 ? Math.min(total / budget, 1) : 1;
  const over = total > budget;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">Total</span>
        <span className="text-xl font-semibold">{formatInr(total)}</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-none bg-blush"
        role="meter"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={total}
      >
        <div
          className={`h-full rounded-none ${over ? "bg-red-600" : "bg-accent"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className={`mt-2 text-xs ${over ? "text-red-700" : "text-muted"}`}>
        {over
          ? `${formatInr(total - budget)} over your ${formatInr(budget)} budget`
          : `${formatInr(budget - total)} left of your ${formatInr(budget)} budget`}
      </p>
    </div>
  );
}
