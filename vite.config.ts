import { defineConfig } from "vite";

// base "./" keeps every asset path relative, so the same build works on GitHub Pages
// (served under /tac-tics/) and later inside a Capacitor phone app.
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
});
