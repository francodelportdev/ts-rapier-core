import { defineConfig, defaultClientConditions } from "vite";

export default defineConfig({
  // Resolve workspace packages to their TypeScript source (see "source" in their exports),
  // so the engine doesn't need to be built during development.
  resolve: { conditions: ["source", ...defaultClientConditions] },
  build: { target: "es2022" },
});
