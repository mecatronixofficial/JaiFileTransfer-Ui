"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/errors/ErrorScreen";
import "./globals.css";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorScreen
          statusCode="500"
          title="The service encountered a problem"
          description="The application could not load correctly. Try again now, or return home and continue from there."
          digest={error.digest}
          onRetry={unstable_retry}
        />
      </body>
    </html>
  );
}
