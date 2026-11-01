export function Swatch({
  color,
  size = "md",
  label,
}: {
  color: string;
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const sizes = { sm: "h-5 w-5", md: "h-9 w-9", lg: "h-12 w-12" };
  return (
    <span
      className={`inline-block shrink-0 rounded-full border border-black/10 shadow-inner ${sizes[size]}`}
      style={{ backgroundColor: color }}
      role="img"
      aria-label={label ?? `Colour ${color}`}
      title={color}
    />
  );
}
