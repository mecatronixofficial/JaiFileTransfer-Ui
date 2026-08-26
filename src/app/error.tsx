"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/errors/ErrorScreen";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[RouteError]", error);
  }, [error]);

  return (
    <ErrorScreen
      statusCode="500"
      title="We could not complete that request"
      description="An unexpected server error interrupted this page. Your files are safe—try the request again or return home."
      digest={error.digest}
      onRetry={unstable_retry}
    />
  );
}
