"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import Button from "./Button";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      variant="ghost"
      className="h-11 w-11 p-0 rounded-2xl border border-gray-200/70 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 text-gray-700 dark:text-gray-200 shadow-md backdrop-blur-md hover:scale-105 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-500 hover:shadow-lg hover:shadow-orange-500/20 dark:hover:bg-zinc-800 transition-all duration-300"
    >
      {isDark ? (
        <Sun
          size={19}
          className="text-yellow-400 transition-transform duration-300 group-hover:rotate-12"
        />
      ) : (
        <Moon
          size={19}
          className="text-slate-700 dark:text-slate-200 transition-transform duration-300 group-hover:-rotate-12"
        />
      )}
    </Button>
  );
};

export default ThemeToggle;
