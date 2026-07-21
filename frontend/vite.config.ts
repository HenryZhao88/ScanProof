import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tailwind runs through PostCSS (see postcss.config.mjs) rather than
// @tailwindcss/vite, which emits preflight and the theme but no utilities
// under Vite 8.1.x.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
