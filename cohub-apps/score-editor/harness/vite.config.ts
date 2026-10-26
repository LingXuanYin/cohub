import { defineConfig } from "vite";

const root = new URL(".", import.meta.url).pathname;

export default defineConfig({
  root,
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
  server: { port: 5181 },
});
