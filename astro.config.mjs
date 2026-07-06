import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://grimbergit.nl',
  integrations: [mdx(), sitemap()],
  build: {
    format: 'directory',
    // Inline all stylesheets into the HTML head. Cuts the critical request
    // chain from HTML→CSS down to just HTML on first paint.
    // Trade-off: CSS isn't cached across pages — acceptable because the CSS
    // is small (~3 KiB) and pages are heavily edge-cached anyway.
    inlineStylesheets: 'always',
  },
  compressHTML: true,
});
