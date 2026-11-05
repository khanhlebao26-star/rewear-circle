import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const files = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/style.css', ['style.css', 'text/css']], ['/app.js', ['app.js', 'text/javascript']]]);
const server = http.createServer(async (req, res) => {
  const file = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404).end('Not found'); return; }
  try {
    const content = await readFile(resolve(root, file[0]));
    res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(500).end('Preview unavailable'); }
});
server.listen(4188, '127.0.0.1', () => process.stdout.write('Rewear Circle prototype: http://127.0.0.1:4188\n'));
