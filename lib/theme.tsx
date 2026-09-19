import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import tailwindColors from "tailwindcss/colors";
import { auth, db } from "./firebase";

// ---------------------------------------------------------------------------
// Theming
//
// Three independent knobs, all stored as CSS variables on <html> so no
// component ever needs to know which theme is active:
//
//   accent      -> brand-*  (any colour: presets or a free hex)
//   layout mode -> studio (dark shell + light workspace, the original look),
//                  dark (everything dark), light (everything light)
//   background  -> a variant of the shell/paper ramp (black, navy, tinted...)
//
// Studio is the default, so an existing user sees exactly the app they had.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "tbc-accent-theme";

export type LayoutMode = "studio" | "dark" | "light";

type TokenMap = Record<string, string>;

/* ------------------------------------------------------------------ */
/* Accent palettes                                                     */
/* ------------------------------------------------------------------ */

const STOPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
type Stops = (typeof STOPS)[number];
type Palette = Record<string, string>;

const PRESET_KEYS = [
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
  swatch: string;
}

/** Built-in accents, taken verbatim from Tailwind's palette. */
export const THEME_PRESETS: ThemePreset[] = PRESET_KEYS.map((key) => {
  const palette = allColors[key] || allColors.blue!;
  return { key, label: PRESET_LABELS[key] || key, palette, swatch: palette["600"] };
});

export const DEFAULT_THEME_KEY = "blue";

/* ------------------------------------------------------------------ */
/* Colour maths — needed for free-form accents and tinted backgrounds   */
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
  const value = (input || "").trim().replace(/^#/, "");
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
 * Builds a Tailwind-shaped scale around an arbitrary colour. The 600 shade is
 * the colour itself unless it is too pale to carry white text.
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
    const lightness =
      stop === "600" ? Math.min(LIGHTNESS_BY_STOP[stop], l > 62 ? 50 : 62) : LIGHTNESS_BY_STOP[stop];
    palette[stop] = hslToHex(h, saturation * SATURATION_BY_STOP[stop], lightness);
  });

  return palette;
}

/* ------------------------------------------------------------------ */
/* Ramps                                                              */
/* ------------------------------------------------------------------ */

const SHELL_KEYS = [
  "app",
  "sidebar",
  "sidebar-deep",
  "surface",
  "surface-2",
  "surface-3",
  "surface-4",
  "line",
  "line-strong",
  "ink",
  "ink-soft",
  "ink-muted",
  "on-brand",
] as const;

const PAPER_KEYS = [
  "paper",
  "paper-2",
  "paper-3",
  "paper-4",
  "paper-line",
  "paper-line-strong",
  "paper-ink",
  "paper-ink-soft",
  "paper-ink-muted",
] as const;

const ALL_KEYS = [...SHELL_KEYS, ...PAPER_KEYS] as const;

// Shell and paper are separate ramps on purpose: in Studio the shell is dark
// while the workspace pages stay light, so the two must never overwrite each
// other's keys.
const DARK_SHELL: TokenMap = {
  app: "#030712",
  sidebar: "#0a101f",
  "sidebar-deep": "#060b17",
  surface: "#0f172a",
  "surface-2": "#020617",
  "surface-3": "#1e293b",
  "surface-4": "#334155",
  line: "#1e293b",
  "line-strong": "#334155",
  ink: "#f8fafc",
  "ink-soft": "#cbd5e1",
  "ink-muted": "#94a3b8",
  "on-brand": "#ffffff",
};

const DARK_PAPER: TokenMap = {
  paper: "#111c33",
  "paper-2": "#0b1322",
  "paper-3": "#1b2942",
  "paper-4": "#2a3b56",
  "paper-line": "#22314c",
  "paper-line-strong": "#35496b",
  "paper-ink": "#f8fafc",
  "paper-ink-soft": "#cbd5e1",
  "paper-ink-muted": "#94a3b8",
};

const LIGHT_SHELL: TokenMap = {
  app: "#eef2f7",
  sidebar: "#ffffff",
  "sidebar-deep": "#f8fafc",
  surface: "#ffffff",
  "surface-2": "#f8fafc",
  "surface-3": "#eef2f7",
  "surface-4": "#e2e8f0",
  line: "#e2e8f0",
  "line-strong": "#cbd5e1",
  ink: "#0f172a",
  "ink-soft": "#475569",
  "ink-muted": "#64748b",
  "on-brand": "#ffffff",
};

const LIGHT_PAPER: TokenMap = {
  paper: "#ffffff",
  "paper-2": "#f8fafc",
  "paper-3": "#f1f5f9",
  "paper-4": "#e2e8f0",
  "paper-line": "#e2e8f0",
  "paper-line-strong": "#cbd5e1",
  "paper-ink": "#0f172a",
  "paper-ink-soft": "#475569",
  "paper-ink-muted": "#64748b",
};

const STATUS_RAMPS: Record<"dark" | "light", TokenMap> = {
  dark: {
    "danger-soft": "#450a0a",
    "danger-line": "#7f1d1d",
    "danger-ink": "#fca5a5",
    "success-soft": "#022c22",
    "success-line": "#065f46",
    "success-ink": "#6ee7b7",
    "warn-soft": "#451a03",
    "warn-line": "#92400e",
    "warn-ink": "#fbbf24",
  },
  light: {
    "danger-soft": "#fef2f2",
    "danger-line": "#fecaca",
    "danger-ink": "#b91c1c",
    "success-soft": "#ecfdf5",
    "success-line": "#a7f3d0",
    "success-ink": "#047857",
    "warn-soft": "#fffbeb",
    "warn-line": "#fde68a",
    "warn-ink": "#b45309",
  },
};

export interface BackgroundOption {
  key: string;
  label: string;
  /** Which layout modes offer this background. */
  modes: LayoutMode[];
  /** Shell overrides (page background, sidebar, control-room surfaces). */
  shell: TokenMap;
  /** Paper overrides; defaults to the mode's own paper ramp. */
  paper?: TokenMap;
}

export const THEME_BACKGROUNDS: BackgroundOption[] = [
  { key: "default", label: "Default", modes: ["studio", "dark", "light"], shell: {} },
  {
    key: "black",
    label: "Midnight",
    modes: ["studio", "dark"],
    shell: {
      app: "#000000",
      sidebar: "#050505",
      "sidebar-deep": "#000000",
      surface: "#0a0a0a",
      "surface-2": "#000000",
      "surface-3": "#1c1c1c",
      "surface-4": "#2e2e2e",
      line: "#1f1f1f",
      "line-strong": "#333333",
      ink: "#fafafa",
      "ink-soft": "#d4d4d8",
      "ink-muted": "#a1a1aa",
    },
  },
  {
    key: "navy",
    label: "Navy",
    modes: ["studio", "dark"],
    shell: {
      app: "#050d1f",
      sidebar: "#08142e",
      "sidebar-deep": "#030a18",
      surface: "#0c1a33",
      "surface-2": "#040b1a",
      "surface-3": "#14274a",
      "surface-4": "#1f3a63",
      line: "#16294a",
      "line-strong": "#24406b",
    },
  },
  {
    key: "slate",
    label: "Slate",
    modes: ["studio", "dark"],
    shell: {
      app: "#0f172a",
      sidebar: "#131d33",
      "sidebar-deep": "#0b1322",
      surface: "#182338",
      "surface-2": "#0b1322",
      "surface-3": "#24324b",
      "surface-4": "#36486a",
      line: "#24324b",
      "line-strong": "#3a4c6b",
    },
  },
  { key: "tint", label: "Accent tint", modes: ["studio", "dark"], shell: {} /* computed */ },
  {
    key: "white",
    label: "Plain white",
    modes: ["light"],
    shell: {
      app: "#f8fafc",
      sidebar: "#ffffff",
      "sidebar-deep": "#ffffff",
      surface: "#ffffff",
      "surface-2": "#f8fafc",
      "surface-3": "#f1f5f9",
      "surface-4": "#e2e8f0",
      line: "#e2e8f0",
      "line-strong": "#cbd5e1",
    },
    paper: { "paper-3": "#f1f5f9", "paper-4": "#e2e8f0" },
  },
  {
    key: "warm",
    label: "Warm paper",
    modes: ["light"],
    shell: {
      app: "#f7f3ec",
      sidebar: "#fffdf8",
      "sidebar-deep": "#faf6ef",
      surface: "#fffdf8",
      "surface-2": "#f9f5ee",
      "surface-3": "#efe8dc",
      "surface-4": "#e3d9c9",
      line: "#e8dfd0",
      "line-strong": "#d5c8b3",
      ink: "#2b2620",
      "ink-soft": "#4a4238",
      "ink-muted": "#7c7266",
    },
    paper: {
      paper: "#fffdf8",
      "paper-2": "#f9f5ee",
      "paper-3": "#efe8dc",
      "paper-4": "#e3d9c9",
      "paper-line": "#e8dfd0",
      "paper-line-strong": "#d5c8b3",
      "paper-ink": "#2b2620",
      "paper-ink-soft": "#4a4238",
      "paper-ink-muted": "#7c7266",
    },
  },
];

export const DEFAULT_BACKGROUND = "default";

/** A shell ramp built from the accent's hue, so the chrome echoes the accent. */
function tintedShell(accentHex: string): TokenMap {
  const rgb = hexToRgb(accentHex);
  const { h } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return {
    app: hslToHex(h, 26, 4),
    sidebar: hslToHex(h, 30, 6),
    "sidebar-deep": hslToHex(h, 26, 3),
    surface: hslToHex(h, 22, 9),
    "surface-2": hslToHex(h, 26, 5),
    "surface-3": hslToHex(h, 20, 15),
    "surface-4": hslToHex(h, 18, 22),
    line: hslToHex(h, 20, 16),
    "line-strong": hslToHex(h, 18, 24),
    ink: "#f8fafc",
    "ink-soft": hslToHex(h, 14, 82),
    "ink-muted": hslToHex(h, 12, 65),
  };
}

export function backgroundsForMode(mode: LayoutMode): BackgroundOption[] {
  return THEME_BACKGROUNDS.filter((option) => option.modes.includes(mode));
}

export interface ThemeSelection {
  /** Accent preset key, or "custom" when the user typed their own colour. */
  key: string;
  /** Accent hex, only meaningful when key === "custom". */
  hex: string;
  mode: LayoutMode;
  background: string;
}

const DEFAULT_SELECTION: ThemeSelection = {
  key: DEFAULT_THEME_KEY,
  hex: "#2563eb",
  mode: "studio",
  background: DEFAULT_BACKGROUND,
};

export function resolveAccentPalette(selection: ThemeSelection): Palette {
  if (selection.key === "custom") {
    const hex = normalizeHex(selection.hex);
    if (hex) return paletteFromHex(hex);
  }
  const preset = THEME_PRESETS.find((p) => p.key === selection.key);
  return preset ? preset.palette : THEME_PRESETS[0].palette;
}

/** Full token set (shell + paper + status) for a selection. */
export function resolveTokens(selection: ThemeSelection): TokenMap {
  const accent = resolveAccentPalette(selection);
  const mode = selection.mode;

  // Studio keeps the original contrast pairing: dark chrome around light
  // workspace pages. Dark and Light make the whole app uniform.
  const shellRamp = mode === "light" ? LIGHT_SHELL : DARK_SHELL;
  const paperRamp = mode === "dark" ? DARK_PAPER : LIGHT_PAPER;

  const background =
    THEME_BACKGROUNDS.find((option) => option.key === selection.background && option.modes.includes(mode)) ||
    THEME_BACKGROUNDS[0];

  const shellOverrides =
    background.key === "tint" ? tintedShell(accent["600"] || "#2563eb") : background.shell || {};

  const status = mode === "light" ? STATUS_RAMPS.light : STATUS_RAMPS.dark;

  return {
    ...shellRamp,
    ...shellOverrides,
    ...paperRamp,
    ...(background.paper || {}),
    ...status,
  };
}

function toRgbTriplet(hex: string): string {
  const { r, g, b } = hexToRgb(normalizeHex(hex) || "#2563eb");
  return `${r} ${g} ${b}`;
}

function applyTokens(accent: Palette, tokens: TokenMap, mode: LayoutMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.tbcMode = mode;

  STOPS.forEach((stop) => {
    const hex = accent[stop];
    if (hex) root.style.setProperty(`--brand-${stop}`, toRgbTriplet(hex));
  });

  // Accent-coloured *text* needs a different shade per mode to stay legible:
  // bright on dark surfaces, deep on light ones.
  const brandInk = accent[root.dataset.tbcMode === "light" ? "700" : "400"];
  if (brandInk) root.style.setProperty("--brand-ink", toRgbTriplet(brandInk));

  ALL_KEYS.forEach((key) => {
    const hex = tokens[key];
    if (hex) root.style.setProperty(`--${key}`, toRgbTriplet(hex));
  });

  Object.keys(STATUS_RAMPS.dark).forEach((key) => {
    const hex = tokens[key];
    if (hex) root.style.setProperty(`--${key}`, toRgbTriplet(hex));
  });
}

/* ------------------------------------------------------------------ */
/* Context                                                            */
/* ------------------------------------------------------------------ */

interface ThemeContextType {
  selection: ThemeSelection;
  palette: Palette;
  setPreset: (key: string) => void;
  setCustomAccent: (hex: string) => void;
  setMode: (mode: LayoutMode) => void;
  setBackground: (key: string) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readStoredSelection(): ThemeSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThemeSelection>;
      if (parsed && typeof parsed.key === "string") {
        return {
          key: parsed.key,
          hex: parsed.hex || DEFAULT_SELECTION.hex,
          mode: (["studio", "dark", "light"] as LayoutMode[]).includes(parsed.mode as LayoutMode)
            ? (parsed.mode as LayoutMode)
            : "studio",
          background: typeof parsed.background === "string" ? parsed.background : DEFAULT_BACKGROUND,
        };
      }
    }
  } catch {
    /* corrupt or unavailable storage — fall back to the defaults */
  }
  return { ...DEFAULT_SELECTION };
}

function isValidStored(value: unknown): value is ThemeSelection {
  const candidate = value as ThemeSelection | null;
  if (!candidate || typeof candidate.key !== "string") return false;
  if (candidate.key === "custom" && !normalizeHex(candidate.hex || "")) return false;
  if (!candidate.mode || !["studio", "dark", "light"].includes(candidate.mode)) return false;
  return true;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Resolved during the first render so there is never a flash of another theme.
  const [selection, setSelection] = useState<ThemeSelection>(() => {
    const stored = readStoredSelection();
    applyTokens(resolveAccentPalette(stored), resolveTokens(stored), stored.mode);
    return stored;
  });

  const palette = useMemo(() => resolveAccentPalette(selection), [selection]);
  const tokens = useMemo(() => resolveTokens(selection), [selection]);

  useEffect(() => {
    applyTokens(palette, tokens, selection.mode);
    if (typeof document !== "undefined") {
      document.documentElement.style.colorScheme = selection.mode === "light" ? "light" : "dark";
    }
  }, [palette, tokens, selection.mode]);

  const persist = useCallback((next: ThemeSelection, syncToCloud: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage disabled — the theme just won't survive a reload */
    }

    const uid = auth.currentUser?.uid;
    if (syncToCloud && uid) {
      setDoc(doc(db, "users", uid), { theme: next }, { merge: true }).catch((err) => {
        console.error("Failed to save theme preference:", err);
      });
    }
  }, []);

  const update = useCallback(
    (patch: Partial<ThemeSelection>) => {
      setSelection((current) => {
        const next = { ...current, ...patch };

        // A background can be mode-specific, so fall back to Default whenever the
        // mode changes out from under it.
        const valid = backgroundsForMode(next.mode).some((option) => option.key === next.background);
        if (!valid) next.background = DEFAULT_BACKGROUND;

        persist(next, true);
        return next;
      });
    },
    [persist]
  );

  const setPreset = useCallback((key: string) => update({ key }), [update]);
  const setCustomAccent = useCallback(
    (hex: string) => {
      const normalized = normalizeHex(hex);
      if (!normalized) return;
      update({ key: "custom", hex: normalized });
    },
    [update]
  );
  const setMode = useCallback((mode: LayoutMode) => update({ mode }), [update]);
  const setBackground = useCallback((background: string) => update({ background }), [update]);

  const resetTheme = useCallback(() => {
    const next = { ...DEFAULT_SELECTION };
    setSelection(next);
    persist(next, true);
  }, [persist]);

  // Adopt the preference saved on the account once we know who is signed in.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) return;
      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        const stored = snap.exists() ? (snap.data() as { theme?: unknown }).theme : null;
        if (isValidStored(stored)) {
          const next: ThemeSelection = {
            key: stored.key,
            hex: stored.hex || DEFAULT_SELECTION.hex,
            mode: stored.mode,
            background: stored.background || DEFAULT_BACKGROUND,
          };
          setSelection(next);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
    () => ({ selection, palette, setPreset, setCustomAccent, setMode, setBackground, resetTheme }),
    [selection, palette, setPreset, setCustomAccent, setMode, setBackground, resetTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
