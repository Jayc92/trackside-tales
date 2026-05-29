// ================== TRACKSIDE ADMIN — tailwind.config.ts ==================
// Light theme tokens borrowed from the public app's brass / parchment
// palette so the admin shell feels like the same product family without
// duplicating the public app's heavy design system. Stays lightweight
// for v7.0 — full typography scale, component layers, and dark mode are
// deferred to v7.2+ when real screens land.

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Trackside palette, sampled from the public app for visual
        // continuity. Used sparingly in v7.0 — full theme arrives later.
        brass:     '#a87a3c',
        parchment: '#f4ebd8',
        ink:       '#1c1812',
        rail:      '#3a2c1d',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['ui-serif', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
