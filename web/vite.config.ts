import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

// Dev: /api wird an `wrangler dev` (Port 8787) weitergereicht.
export default defineConfig({
  plugins: [react(), tailwind()],
  server: { proxy: { "/api": "http://localhost:8787" } },
});
