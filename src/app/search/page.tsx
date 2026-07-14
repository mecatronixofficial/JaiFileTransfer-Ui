"use client";
import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AuthGuard from "@/components/auth/AuthGuard";
import { searchApi } from "@/lib/api";
import { FileItem } from "@/types";
import { FileCard } from "@/components/files/FileCard";
import { EmptyState, Spinner } from "@/components/ui";
import { Search, X } from "lucide-react";
import { handleApiError } from "@/lib/error-handler";
import Button from "@/components/ui/Button";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchApi.search(query);
        const f =
          res.data?.files ||
          res.data?.results ||
          res.data?.data ||
          res.data ||
          [];
        setResults(Array.isArray(f) ? f : []);
        setSearched(true);
      } catch (err) {
        handleApiError(err);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  function refresh() {
    const q = query;
    setQuery("");
    setTimeout(() => setQuery(q), 10);
  }

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="animate-fade-in">
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>
              Search
            </h1>
            <div className="relative max-w-2xl">
              <span
                className="
    absolute left-4 top-1/2
    -translate-y-1/2
    text-gray-400
    flex items-center
  "
              >
                {loading ? <Spinner size={18} /> : <Search size={18} />}
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files by name, type, or content..."
                className="
    w-full

    rounded-2xl
    border-2 border-gray-200
    dark:border-gray-700

    bg-white
    dark:bg-gray-900

    py-4 pl-12 pr-12

    text-[15px]
    text-gray-900
    dark:text-white

    placeholder:text-gray-400
    dark:placeholder:text-gray-500

    shadow-lg shadow-black/5
    dark:shadow-black/20

    outline-none
    transition-all duration-200

    focus:border-orange-500
    focus:ring-4
    focus:ring-orange-500/10
  "
              />
              {query && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuery("")}
                  className="
      absolute right-2 top-1/2
      -translate-y-1/2

      h-8 w-8
      rounded-full

      text-gray-400
      hover:text-orange-500
      hover:bg-orange-500/10
    "
                >
                  <X size={16} />
                </Button>
              )}
            </div>
          </div>

          {!query && !searched && (
            <div className="flex flex-col items-center justify-center pt-16 text-center">
              <Search size={52} className="mb-4 text-gray-300 dark:text-gray-600" />
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                Find your files
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                Search across all your files and shared documents
              </p>
            </div>
          )}

          {searched && !loading && results.length === 0 && (
            <EmptyState
              icon={<Search size={32} />}
              title={`No results for "${query}"`}
              description="Try different keywords or check the spelling"
            />
          )}

          {results.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  marginBottom: 16,
                }}
              >
                {results.length} result{results.length !== 1 ? "s" : ""} for{" "}
                <strong style={{ color: "var(--text)" }}>"{query}"</strong>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                {results.map((f) => (
                  <FileCard key={f.id} file={f} onRefresh={refresh} />
                ))}
              </div>
            </>
          )}
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
}
