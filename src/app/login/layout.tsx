import type { Metadata } from "next";
import { SITE_DESCRIPTION } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Sign In",
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/login" },
  robots: { index: true, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
