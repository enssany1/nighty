import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "editor";
          if (id.includes("@phosphor-icons")) return "icons";
          if (id.includes("react")) return "react";
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
