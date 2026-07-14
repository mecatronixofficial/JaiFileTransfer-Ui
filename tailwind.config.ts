// tailwind.config.js

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",

  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
    "./src/pages/**/*.{js,jsx,ts,tsx}",
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/layouts/**/*.{js,jsx,ts,tsx}",
  ],

  theme: {
    extend: {
      colors: {
        orange: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
        },

        light: {
          bg: "#ffffff",
          bgSecondary: "#fafafa",
          bgTertiary: "#f5f5f5",
          card: "#ffffff",
          border: "#e5e5e5",
          borderHover: "#d4d4d4",
          text: "#171717",
          textMuted: "#737373",
          textDim: "#a3a3a3",
        },

        dark: {
          bg: "#0a0a0a",
          bgSecondary: "#141414",
          bgTertiary: "#1a1a1a",
          card: "#1f1f1f",
          border: "#2a2a2a",
          borderHover: "#3a3a3a",
          text: "#fafafa",
          textMuted: "#a3a3a3",
          textDim: "#737373",
        },

        accent: {
          DEFAULT: "#f97316",
          light: "#fb923c",
          dark: "#ea580c",
          hover: "#c2410c",
        },

        success: {
          DEFAULT: "#10b981",
          light: "#34d399",
          dark: "#059669",
        },

        warning: {
          DEFAULT: "#f59e0b",
          light: "#fbbf24",
          dark: "#d97706",
        },

        error: {
          DEFAULT: "#ef4444",
          light: "#f87171",
          dark: "#dc2626",
        },

        info: {
          DEFAULT: "#3b82f6",
          light: "#60a5fa",
          dark: "#2563eb",
        },
      },

      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
        "2xl": "2rem",
        full: "9999px",
      },

      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)",

        "card-hover":
          "0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.08)",

        accent: "0 0 20px rgba(249,115,22,0.2)",

        "accent-lg": "0 0 30px rgba(249,115,22,0.3)",

        glow: "0 0 15px rgba(249,115,22,0.5)",
      },

      fontFamily: {
        sans: ["Inter", "DM Sans", "system-ui", "sans-serif"],

        display: ["Poppins", "Syne", "sans-serif"],
      },

      animation: {
        "fade-in": "fadeIn 0.3s ease forwards",
        "slide-in": "slideIn 0.3s ease forwards",
        "slide-up": "slideUp 0.3s ease forwards",
        shimmer: "shimmer 1.5s infinite",
        float: "float 3s ease-in-out infinite",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",

        "slide-in-from-top-2": "slide-in-from-top-2 0.2s ease-out",
        "slide-in-from-top-4": "slide-in-from-top-4 0.2s ease-out",
        "slide-in-left": "slide-in-from-left 0.3s ease-out",
        "zoom-in": "zoom-in 0.2s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },

      keyframes: {
        fadeIn: {
          from: {
            opacity: "0",
            transform: "translateY(10px)",
          },
          to: {
            opacity: "1",
            transform: "translateY(0)",
          },
        },

        slideIn: {
          from: {
            opacity: "0",
            transform: "translateX(-20px)",
          },
          to: {
            opacity: "1",
            transform: "translateX(0)",
          },
        },

        slideUp: {
          from: {
            opacity: "0",
            transform: "translateY(20px)",
          },
          to: {
            opacity: "1",
            transform: "translateY(0)",
          },
        },

        shimmer: {
          "0%": {
            backgroundPosition: "-200% 0",
          },

          "100%": {
            backgroundPosition: "200% 0",
          },
        },

        float: {
          "0%,100%": {
            transform: "translateY(0px)",
          },

          "50%": {
            transform: "translateY(-6px)",
          },
        },

        pulseGlow: {
          "0%,100%": {
            boxShadow: "0 0 20px rgba(249,115,22,0.2)",
          },

          "50%": {
            boxShadow: "0 0 40px rgba(249,115,22,0.4)",
          },
        },

        "slide-in-from-top-2": {
          "0%": { transform: "translateY(-8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-in-from-top-4": {
          "0%": { transform: "translateY(-16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-in-from-left": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "zoom-in": {
          "0%": { transform: "scale(0)" },
          "100%": { transform: "scale(1)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
    },
  },

  plugins: [],
};
