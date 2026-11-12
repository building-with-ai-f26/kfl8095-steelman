import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // In development the page comes from Vite and the API from the service,
    // so the browser still sees one address, as it will in production.
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
});
