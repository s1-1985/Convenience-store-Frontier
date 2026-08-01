import { defineConfig } from "vite";

export default defineConfig({
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
