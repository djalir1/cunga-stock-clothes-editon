import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8010,
  },
  define: {
    // Shown in Settings → About this app, e.g. "2026.09.29 15:40"
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ").replace(/-/g, ".")),
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
