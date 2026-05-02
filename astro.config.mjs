// @ts-check
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL;

export default defineConfig({
  ...(site ? { site } : {}),
  output: 'static',
});
