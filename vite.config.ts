import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development (npm run dev), Vite serves the interface on 5173 and forwards /api to the data server.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:4321" } },
  build: { outDir: "dist", emptyOutDir: true },
});
