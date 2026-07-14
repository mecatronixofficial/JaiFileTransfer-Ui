import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Jai Export Enterprises - Secure File Transfer",
  description: "Fast, secure file transfer and storage platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="bg-(--bg) text-(--text)">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
