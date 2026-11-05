import react from "@vitejs/plugin-react";
import { defineConfig, defaultClientConditions } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Resolve workspace packages to their TypeScript source (see "source" in their exports),
  // so the engine doesn't need to be built during development.
  resolve: { conditions: ["source", ...defaultClientConditions] },
  build: { target: "es2022" },
});
