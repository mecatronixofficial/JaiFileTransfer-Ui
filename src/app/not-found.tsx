import type { Metadata } from "next";
import ErrorScreen from "@/components/errors/ErrorScreen";

export const metadata: Metadata = {
  title: "Page Not Found",
  description: "The requested page could not be found.",
};

export default function NotFound() {
  return (
    <ErrorScreen
      statusCode="404"
      title="This page has moved or does not exist"
      description="The link may be outdated, or the address may have been entered incorrectly. Choose a destination below to continue securely."
    />
  );
}
