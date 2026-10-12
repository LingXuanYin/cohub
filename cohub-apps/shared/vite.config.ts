import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export function resourceAppConfig() {
  return defineConfig({
    base: "./",
    plugins: [svelte()],
    resolve: {
      dedupe: ["svelte"],
      alias: {
        $messages: new URL(
          "../../apps/web/src/lib/paraglide/messages.js",
          import.meta.url,
        ).pathname,
      },
    },
    build: { target: "es2022" },
  });
}

export default resourceAppConfig();
