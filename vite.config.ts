import { defineConfig } from 'vitest/config';

// Absolute URL of the deployed site, used for OGP tags.
// CI passes the GitHub Pages URL; this default is for local builds.
const siteUrl = (process.env.SITE_URL || 'https://uhyo.github.io/eigo-haiku').replace(/\/?$/, '/');

export default defineConfig({
  // Relative asset paths so the build works under any GitHub Pages subpath
  base: './',
  plugins: [
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
    },
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
