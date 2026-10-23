import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    // keep every script external so the strict Content-Security-Policy holds
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8080", "/content": "http://localhost:8080" },
  },
});
