// Stands in for Open Food Facts during the end-to-end tests: no test ever reaches the real service.
//   GET /api/v2/product/{code}.json -> fixtures/off/{code}.json, or 404 when there is no file
//   codes listed in DOWN_CODES answer 500 (service outage)
//   GET /ready                      -> 200 (used by Playwright to wait for the server)
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.OFF_FIXTURE_PORT ?? 4010);
const DOWN_CODES = new Set(['5000112637922']);
const dir = path.join(import.meta.dirname, 'off');

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/ready') {
    res.writeHead(200).end('ok');
    return;
  }
  const match = /^\/api\/v2\/product\/(\d{8,14})\.json$/.exec(url.pathname);
  if (!match) {
    res.writeHead(404).end();
    return;
  }
  const code = match[1];
  if (DOWN_CODES.has(code)) {
    res.writeHead(500).end('{"error":"fixture outage"}');
    return;
  }
  try {
    const body = await readFile(path.join(dir, `${code}.json`));
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"status":0}');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`off-server : fixtures sur le port ${PORT}`));
