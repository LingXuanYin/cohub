import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

const appActions = (): Plugin => ({
  name: "campfire-app-actions",
  apply: "build",
  closeBundle() {
    const from = resolve(import.meta.dirname, "spirit");
    const to = resolve(import.meta.dirname, "dist/.cohub/actions");
    if (!existsSync(from)) return;
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true, filter: (path) => !path.endsWith(".test.ts") });
  },
});

export default defineConfig({
  base: "./",
  plugins: [svelte(), appActions()],
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
