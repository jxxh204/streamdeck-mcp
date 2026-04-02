import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Task Hub",
  description: "Aggregate task context from multiple tools",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
