// @ts-check
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL;

export default defineConfig({
  ...(site ? { site } : {}),
  output: 'static',
  vite: {
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
  },
});
