export function StyleTag({ children }: { children: string }) {
  return (
    <span className="inline-block rounded-none bg-blush px-2.5 py-0.5 text-xs text-ink">
      {children}
    </span>
  );
}
