/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./App.tsx",
    "./main.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ---- accent ------------------------------------------------------
        // Written at runtime by lib/theme.tsx, so `brand-*` follows the accent
        // the user picked (defaults to Tailwind's blue in index.css).
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          950: "rgb(var(--brand-950) / <alpha-value>)",
        },

        // Accent-coloured text: a light shade on dark surfaces, a deep one on
        // light surfaces. Kept separate from `brand-*` so it can vary by mode.
        "brand-ink": "rgb(var(--brand-ink) / <alpha-value>)",

        // ---- shell -------------------------------------------------------
        // The app frame: page background, sidebar and the control-room surfaces
        // used by the layout, student portal and profile.
        app: "rgb(var(--app) / <alpha-value>)",
        sidebar: "rgb(var(--sidebar) / <alpha-value>)",
        "sidebar-deep": "rgb(var(--sidebar-deep) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        "surface-3": "rgb(var(--surface-3) / <alpha-value>)",
        "surface-4": "rgb(var(--surface-4) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        "line-strong": "rgb(var(--line-strong) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        "ink-muted": "rgb(var(--ink-muted) / <alpha-value>)",
        "on-brand": "rgb(var(--on-brand) / <alpha-value>)",

        // ---- paper -------------------------------------------------------
        // The workspace pages (quiz, history, grading, lesson plans) have their
        // own ramp, so they can stay light while the shell around them is dark.
        paper: "rgb(var(--paper) / <alpha-value>)",
        "paper-2": "rgb(var(--paper-2) / <alpha-value>)",
        "paper-3": "rgb(var(--paper-3) / <alpha-value>)",
        "paper-4": "rgb(var(--paper-4) / <alpha-value>)",
        "paper-line": "rgb(var(--paper-line) / <alpha-value>)",
        "paper-line-strong": "rgb(var(--paper-line-strong) / <alpha-value>)",
        "paper-ink": "rgb(var(--paper-ink) / <alpha-value>)",
        "paper-ink-soft": "rgb(var(--paper-ink-soft) / <alpha-value>)",
        "paper-ink-muted": "rgb(var(--paper-ink-muted) / <alpha-value>)",

        // ---- status ------------------------------------------------------
        "danger-soft": "rgb(var(--danger-soft) / <alpha-value>)",
        "danger-line": "rgb(var(--danger-line) / <alpha-value>)",
        "danger-ink": "rgb(var(--danger-ink) / <alpha-value>)",
        "success-soft": "rgb(var(--success-soft) / <alpha-value>)",
        "success-line": "rgb(var(--success-line) / <alpha-value>)",
        "success-ink": "rgb(var(--success-ink) / <alpha-value>)",
        "warn-soft": "rgb(var(--warn-soft) / <alpha-value>)",
        "warn-line": "rgb(var(--warn-line) / <alpha-value>)",
        "warn-ink": "rgb(var(--warn-ink) / <alpha-value>)",

        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
      },
    },
  },
  plugins: [],
};
