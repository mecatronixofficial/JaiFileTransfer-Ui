"use client";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ToastProvider from "@/components/providers/ToastProvider";
import QueryProvider from "@/components/providers/QueryProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <QueryProvider>
      <ThemeProvider>
        {children}
        <ToastProvider />
      </ThemeProvider>
      </QueryProvider>
    </AuthProvider>
  );
}
