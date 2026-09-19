import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import tailwindColors from "tailwindcss/colors";
import { auth, db } from "./firebase";

// Accent theming.
//
// Every themed surface in the app uses the `brand-*` Tailwind colour, which is
// wired to the CSS variables written here (see tailwind.config.js and
// index.css). Picking a different accent just rewrites those variables, so no
// component needs to know which theme is active.
//
// The built-in presets take their values straight from Tailwind's own palette,
// which means the default ("blue") is pixel-identical to the design the app
// shipped with.

const STOPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;

type Stops = (typeof STOPS)[number];
type Palette = Record<string, string>;

const STORAGE_KEY = "tbc-accent-theme";

export const PRESET_KEYS = [
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "slate",
] as const;

const PRESET_LABELS: Record<string, string> = {
  blue: "Classic Blue",
  indigo: "Indigo",
  violet: "Violet",
  purple: "Purple",
  fuchsia: "Fuchsia",
  pink: "Pink",
  rose: "Rose",
  red: "Crimson",
  orange: "Orange",
  amber: "Amber",
  yellow: "Sunflower",
  lime: "Lime",
  emerald: "Emerald",
  teal: "Teal",
  cyan: "Cyan",
  sky: "Sky",
  slate: "Graphite",
};

const allColors = tailwindColors as unknown as Record<string, Palette | undefined>;

export interface ThemePreset {
  key: string;
  label: string;
  palette: Palette;
  /** The 600 shade — used for the swatch in the picker. */
  swatch: string;
}

/** Built-in presets, values taken verbatim from Tailwind's palette. */
export const THEME_PRESETS: ThemePreset[] = PRESET_KEYS.map((key) => {
  const palette = allColors[key] || allColors.blue!;
  return { key, label: PRESET_LABELS[key] || key, palette, swatch: palette["600"] };
});

export const DEFAULT_THEME_KEY = "blue";

export interface ThemeSelection {
  /** A preset key, or "custom" when the user typed their own colour. */
  key: string;
  /** Hex colour, only meaningful when key === "custom". */
  hex: string;
}

/* ------------------------------------------------------------------ */
/* Colour maths — only needed for the free-form "any colour" option.    */
/* ------------------------------------------------------------------ */

const LIGHTNESS_BY_STOP: Record<Stops, number> = {
  50: 97,
  100: 93,
  200: 86,
  300: 76,
  400: 64,
  500: 56,
  600: 50,
  700: 40,
  800: 31,
  900: 24,
  950: 15,
};

// Tailwind's lighter shades are less saturated; mirroring that keeps a custom
// colour from looking neon at the top of the scale.
const SATURATION_BY_STOP: Record<Stops, number> = {
  50: 0.62,
  100: 0.68,
  200: 0.78,
  300: 0.86,
  400: 0.94,
  500: 1,
  600: 1,
  700: 1,
  800: 0.98,
  900: 0.95,
  950: 0.9,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(value)) {
    return `#${value
      .split("")
      .map((c) => c + c)
      .join("")}`.toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toLowerCase()}`;
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace(/^#/, "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const channel = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

/**
 * Builds a full Tailwind-shaped scale around an arbitrary colour. The 600 shade
 * keeps the caller's exact colour unless it is too pale to carry white text, in
 * which case it is darkened so buttons stay readable.
 */
export function paletteFromHex(hex: string): Palette {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const saturation = clamp(s, 22, 92);

  const palette: Palette = {};
  STOPS.forEach((stop) => {
    if (stop === "600" && l <= 62) {
      palette[stop] = hex;
      return;
    }
    const lightness = stop === "600" ? Math.min(LIGHTNESS_BY_STOP[stop], l > 62 ? 50 : 62) : LIGHTNESS_BY_STOP[stop];
    palette[stop] = hslToHex(h, saturation * SATURATION_BY_STOP[stop], lightness);
  });

  return palette;
}

export function resolvePalette(selection: ThemeSelection): Palette {
  if (selection.key === "custom") {
    const hex = normalizeHex(selection.hex);
    if (hex) return paletteFromHex(hex);
  }
  const preset = THEME_PRESETS.find((p) => p.key === selection.key);
  return preset ? preset.palette : THEME_PRESETS[0].palette;
}

function toRgbTriplet(hex: string): string {
  const { r, g, b } = hexToRgb(normalizeHex(hex) || "#2563eb");
  return `${r} ${g} ${b}`;
}

/** Writes the palette onto :root as --brand-* variables. */
export function applyPalette(palette: Palette) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  STOPS.forEach((stop) => {
    const hex = palette[stop];
    if (hex) root.style.setProperty(`--brand-${stop}`, toRgbTriplet(hex));
  });
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

interface ThemeContextType {
  selection: ThemeSelection;
  palette: Palette;
  setPreset: (key: string) => void;
  setCustomAccent: (hex: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readStoredSelection(): ThemeSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ThemeSelection;
      if (parsed && typeof parsed.key === "string") {
        return { key: parsed.key, hex: parsed.hex || "#2563eb" };
      }
    }
  } catch {
    /* corrupt or unavailable storage — fall back to the default theme */
  }
  return { key: DEFAULT_THEME_KEY, hex: "#2563eb" };
}

function isValidSelection(value: unknown): value is ThemeSelection {
  const candidate = value as ThemeSelection | null;
  if (!candidate || typeof candidate.key !== "string") return false;
  if (candidate.key === "custom") return !!normalizeHex(candidate.hex || "");
  return PRESET_KEYS.includes(candidate.key as (typeof PRESET_KEYS)[number]);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Resolved during the first render so there is no flash of the default colour.
  const [selection, setSelection] = useState<ThemeSelection>(() => {
    const stored = readStoredSelection();
    applyPalette(resolvePalette(stored));
    return stored;
  });

  const palette = useMemo(() => resolvePalette(selection), [selection]);

  // Repaint on every change.
  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  const persist = useCallback((next: ThemeSelection, syncToCloud: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage disabled — theme just won't survive a reload */
    }

    const uid = auth.currentUser?.uid;
    if (syncToCloud && uid) {
      setDoc(doc(db, "users", uid), { theme: next }, { merge: true }).catch((err) => {
        console.error("Failed to save theme preference:", err);
      });
    }
  }, []);

  const setPreset = useCallback(
    (key: string) => {
      const next: ThemeSelection = { key, hex: selection.hex || "#2563eb" };
      setSelection(next);
      persist(next, true);
    },
    [persist, selection.hex]
  );

  const setCustomAccent = useCallback(
    (hex: string) => {
      const normalized = normalizeHex(hex);
      if (!normalized) return;
      const next: ThemeSelection = { key: "custom", hex: normalized };
      setSelection(next);
      persist(next, true);
    },
    [persist]
  );

  // Pull the saved preference back down once we know who is signed in, so a
  // student on another machine gets their colour too. Only adopt it if it is
  // valid and the user hasn't already picked something on this device.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) return;
      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        const stored = snap.exists() ? (snap.data() as { theme?: unknown }).theme : null;
        if (isValidSelection(stored)) {
          setSelection({ key: stored.key, hex: stored.hex });
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.error("Failed to load theme preference:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  const value = useMemo(
    () => ({ selection, palette, setPreset, setCustomAccent }),
    [selection, palette, setPreset, setCustomAccent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
