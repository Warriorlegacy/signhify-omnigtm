import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Zero-dependency static server for the viewer app.
 * `node scripts/serve-viewer.mjs --port 4173 --api http://localhost:3000`
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'apps', 'viewer-3d');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const port = Number(arg('port', process.env.PORT ?? 4173));
const api = arg('api', process.env.OMNIGTM_API_BASE ?? 'http://localhost:3000').replace(/\/+$/, '');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);
  const file = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const full = path.resolve(root, file);
  if (!full.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(full);
    response.writeHead(200, { 'Content-Type': types[path.extname(full)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, () => {
  console.log(`viewer-3d on http://localhost:${port}/?slug=demo&api=${encodeURIComponent(api)}`);
});
