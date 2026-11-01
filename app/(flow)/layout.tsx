import type { ReactNode } from "react";

export default function FlowLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-8 pt-6">
      {children}
    </main>
  );
}
