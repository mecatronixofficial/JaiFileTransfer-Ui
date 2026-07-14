import { Suspense } from "react";
import LinksPageClient from "./LinksPageClient";

function LinksPageFallback() {
  return <div className="min-h-screen bg-gray-50 dark:bg-black" />;
}

export default function LinksPage() {
  return (
    <Suspense fallback={<LinksPageFallback />}>
      <LinksPageClient />
    </Suspense>
  );
}
