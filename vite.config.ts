import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "data",
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
