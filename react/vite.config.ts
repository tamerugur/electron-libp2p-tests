import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  base: "./", // Ensure relative asset paths for Electron
  plugins: [react()],
});
