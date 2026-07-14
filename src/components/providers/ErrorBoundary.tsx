"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production, replace with Sentry / Datadog / etc.
    console.error("[ErrorBoundary]", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-(--bg) px-6 py-10">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white/80 p-8 shadow-2xl backdrop-blur-xl dark:border-gray-800 dark:bg-gray-900/80">
            <div className="flex flex-col items-center text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 ring-1 ring-red-500/20">
                <AlertTriangle className="h-7 w-7 text-red-500" />
              </div>

              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Something went wrong
              </h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                An unexpected error occurred. You can try again, or reload the
                page if the problem persists.
              </p>

              {process.env.NODE_ENV === "development" && this.state.error && (
                <pre className="mt-5 w-full overflow-x-auto rounded-lg bg-gray-100 p-3 text-left text-xs text-red-600 dark:bg-gray-800 dark:text-red-400">
                  {this.state.error.message}
                </pre>
              )}

              <div className="mt-6 flex w-full gap-3">
                <button
                  onClick={this.handleReset}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Try again
                </button>
                <button
                  onClick={this.handleReload}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-colors hover:bg-orange-600"
                >
                  <RefreshCw size={14} />
                  Reload
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}