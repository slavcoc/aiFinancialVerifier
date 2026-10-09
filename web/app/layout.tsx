import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Second Reader — AI wrote it. Someone should check it.",
  description:
    "Second Reader flags the arithmetic errors in AI-generated business reports — deterministic checks, evidence you can audit, no black-box trust scores.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
