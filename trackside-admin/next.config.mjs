// ================== TRACKSIDE ADMIN — next.config.mjs ==================
// Minimal config for ADMIN-v7.0 scaffold. The admin app deliberately
// avoids any feature flag, image-domain, or rewrite plumbing in this
// phase — we want a clean, audited surface before adding mechanism.
//
// Notes for later phases:
//   * v7.1 may add `experimental.serverActions` config if Next default
//     ever changes. Currently server actions are on by default.
//   * v7.7 will add `images.remotePatterns` for Supabase Storage CDN
//     once asset URLs land. Do NOT preemptively add it here.
//   * `reactStrictMode: true` flushes subtle bugs in dev (double
//     effects, suspended-state mismatches). Cheap insurance.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
