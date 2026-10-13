import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'pixi', test: /node_modules\/pixi\.js\// },
            { name: 'cohub', test: /node_modules\/@neta-art\/cohub\// },
          ],
        },
      },
    },
  },
});
