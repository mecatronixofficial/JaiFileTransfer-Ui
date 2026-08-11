import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help",
  description:
    "Get help using Jai Export Enterprises secure file transfer and cloud storage services.",
  alternates: { canonical: "/help" },
  robots: { index: true, follow: true },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
