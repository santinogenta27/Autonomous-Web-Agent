import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const backend = process.env.GHOST_BACKEND_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: "..",
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/ws": { target: backend.replace(/^http/, "ws"), ws: true, changeOrigin: true },
    },
  },
});
