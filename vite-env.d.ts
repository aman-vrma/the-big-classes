/// <reference types="vite/client" />

// Set from vite.config.ts (define) — only used to expose the validator test hook.
declare const __GARBAGE_VALIDATOR__: boolean;

interface Window {
  __garbageTest?: {
    looksLikeGarbage: (text: string) => boolean;
    isWordLike: (token: string) => boolean;
  };
}
