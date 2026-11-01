const STEPS = ["Inspiration", "Selfie", "Look DNA", "Adapt", "Try-on", "Cart"];

export function StepHeader({
  step,
  title,
  subtitle,
}: {
  /** 1-based screen number. */
  step: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-5">
      <div
        className="mb-3 flex gap-1"
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step}
        aria-valuetext={`Step ${step} of ${STEPS.length}: ${STEPS[step - 1]}`}
      >
        {STEPS.map((name, index) => (
          <span
            key={name}
            className={`h-1 flex-1 rounded-none ${
              index < step ? "bg-accent" : "bg-blush"
            }`}
          />
        ))}
      </div>
      <p className="text-xs font-medium  text-muted">
        Step {step} of {STEPS.length}
      </p>
      <h1 className="mt-1 text-4xl leading-none">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
    </header>
  );
}
