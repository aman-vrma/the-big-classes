// Shared "is this real academic input?" validation for every AI generator
// (quiz, lesson plan, assignment, grader). Without it, typing keyboard mash
// like "asdfghjkl" or "!!!!!!" would happily burn Gemini/OpenRouter credits
// producing garbage.

import { z } from "zod";

const VOWELS = /[aeiou]/;

// Home-row / keyboard-run fragments that essentially never occur in real words
// (checked: no dictionary word contains these). "rty" excluded on purpose —
// it appears in thirty/party/forty.
const KEYBOARD_MASH = [
  "asd", "fgh", "jkl", "qwe", "zxc", "vbn", "bnm", "mnb",
  "sdf", "dfg", "ghj", "hjk", "xcv", "cvb", "lkj", "uyt", "hjkl", "yuio",
];

function isWordLike(token: string): boolean {
  if (token.length < 3) return false;
  if (!/^[a-zA-Z]+$/.test(token)) return false;

  const lower = token.toLowerCase();
  if (KEYBOARD_MASH.some((frag) => lower.includes(frag))) return false;

  // A word dominated by one character ("aaaa", "wwwww") isn't a word.
  const counts = new Map<string, number>();
  for (const ch of lower) counts.set(ch, (counts.get(ch) || 0) + 1);
  const maxShare = Math.max(...counts.values()) / lower.length;
  if (maxShare > 0.6) return false;

  // Needs a vowel...
  if (!VOWELS.test(lower)) return false;

  // ...and for longer tokens, a realistic vowel ratio. Keyboard runs like
  // "asdef" sit at ~0.2; real words like "cache", "memory", "physics" clear it.
  const vowelRatio = (lower.match(/[aeiou]/g) || []).length / lower.length;
  if (lower.length >= 5 && vowelRatio < 0.2) return false;

  return true;
}

/** Rejects asdfghjkl, qwerty, aaaaaa, 12345, !!!???, and letter soup. */
export function looksLikeGarbage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) return true;

  // Non-Latin scripts (Hindi, Urdu, etc.) are legitimate input — never judge
  // them with heuristics tuned for English.
  if (/[^\x20-\x7E]/.test(trimmed)) return false;

  // No letters at all: pure numbers or symbols.
  if (!/[a-zA-Z]/.test(trimmed)) return true;

  // Mostly punctuation: "!!!!", "???...", "@#$%"
  const symbols = (trimmed.match(/[^a-zA-Z0-9\s]/g) || []).length;
  if (symbols / trimmed.length > 0.4) return true;

  // Long vowel-less token: "bcdfghjkl"
  for (const token of trimmed.toLowerCase().split(/\s+/)) {
    const clean = token.replace(/[^a-z]/g, "");
    if (clean.length >= 6 && !VOWELS.test(clean)) return true;
  }

  // Not a single word-like token in the whole input.
  const wordLike = trimmed.split(/\s+/).filter(isWordLike).length;
  if (wordLike < 1) return true;

  return false;
}

/** Friendly message shown under the offending form field. */
export function describeGarbage(fieldLabel: string): string {
  return `${fieldLabel} doesn't look like real words. Enter an actual topic — gibberish just wastes AI credits.`;
}

// Test hook (dev only): lets the browser console run the validator test-suite
// via window.__garbageTest (declared in vite-env.d.ts).
if (import.meta.env.DEV && typeof window !== "undefined" && __GARBAGE_VALIDATOR__) {
  (window as any).__garbageTest = { looksLikeGarbage, isWordLike };
}

// Drop-in for generator form schemas: checks the academic free-text fields and
// attaches the error to the exact field, so <FormMessage /> renders it in place.
export const garbageAwareSchema = <T extends z.ZodObject<any>>(schema: T) =>
  schema.superRefine((values, ctx) => {
    const textFields: (keyof typeof values & string)[] = ["topic", "subject", "question"];
    for (const field of textFields) {
      const value = values[field];
      if (typeof value === "string" && value.trim() && looksLikeGarbage(value)) {
        const label = field === "question" ? "The question" : `"${field}"`;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: describeGarbage(label),
        });
      }
    }
  });
