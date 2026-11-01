import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { FlowProvider } from "@/app/components/FlowProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Look DNA",
  description:
    "Turn any inspiration look into a shoppable outfit adapted to your skin tone and budget.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf6f2",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <FlowProvider>
          {children}
        </FlowProvider>
      </body>
    </html>
  );
}
