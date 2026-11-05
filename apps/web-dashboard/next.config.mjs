import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
