import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Anchor file tracing on the monorepo, not on a stray lockfile above it.
  outputFileTracingRoot: repoRoot,
  // Workspace packages ship TypeScript source, so Next has to transpile them.
  transpilePackages: ['@omnigtm/core', '@omnigtm/ai-gateway', '@omnigtm/media', '@omnigtm/outbound'],
  serverExternalPackages: ['pg', 'nodemailer'],
  outputFileTracingIncludes: {
    '/api/v1/**': ['./node_modules/pg/**'],
  },
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
  async headers() {
    const headers = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ];
    // Dev uses eval for HMR and inline bootstrap scripts, so the policy only
    // ships on the production build. `unsafe-inline` is required because Next
    // injects its hydration bootstrap inline; every other origin is denied.
    if (process.env.NODE_ENV === 'production') {
      headers.push(
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        {
          key: 'Content-Security-Policy',
          value:
            "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; " +
            "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
        }
      );
    }
    return [{ source: '/:path*', headers }];
  },
  // Workspace packages use TypeScript's ESM convention (`./x.js` pointing at
  // `x.ts`). Webpack needs to be told that mapping explicitly.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
