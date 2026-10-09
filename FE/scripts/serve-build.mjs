import {createServer} from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {buildDirectory, verifyManifest} from './artifact.mjs';

// Test-only static server. No API, authentication backend or MQTT proxy.
const root = await realpath(buildDirectory);
await verifyManifest(root);
const prefix = '/kth_project_devops/';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2'};
createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
    const path = pathname.slice(prefix.length) || 'index.html';
    const candidate = resolve(root, path);
    if (!candidate.startsWith(root + sep)) { response.writeHead(404).end(); return; }
    const file = await realpath(candidate);
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
    response.writeHead(200);
    response.end(request.method === 'HEAD' ? undefined : await readFile(file));
  } catch { response.writeHead(404).end(); }
}).listen(4173, '127.0.0.1', () => console.log('Compiled frontend: http://127.0.0.1:4173' + prefix));
