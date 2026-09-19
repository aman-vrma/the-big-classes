import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// NOTE: this config used to live inside vite-env.d.ts, where Vite never reads it
// (so the React plugin and the "@" alias were silently never active).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  // Test-only hook: exposes the garbage validator for browser-console tests.
  define: {
    __GARBAGE_VALIDATOR__: "true",
  },
});
