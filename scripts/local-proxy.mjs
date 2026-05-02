import http from 'node:http';
import fs from 'node:fs/promises';
import worker from '../workers/api.js';

const ROOT = new URL('..', import.meta.url);
const ASTRO_BASE = 'http://127.0.0.1:4322';
const PORT = 4321;

const parseDevVars = async () => {
  const env = {};
  try {
    const raw = await fs.readFile(new URL('.dev.vars', ROOT), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
    }
  } catch {}
  return env;
};

const devVars = await parseDevVars();
const env = {
  ADMIN_PASSWORD: devVars.ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '',
  GITHUB_TOKEN: devVars.GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? '',
  GITHUB_OWNER: devVars.GITHUB_OWNER ?? process.env.GITHUB_OWNER ?? '',
  GITHUB_REPO: devVars.GITHUB_REPO ?? process.env.GITHUB_REPO ?? '',
  GITHUB_BRANCH: devVars.GITHUB_BRANCH ?? process.env.GITHUB_BRANCH ?? '',
  CONTENT_DIR: devVars.CONTENT_DIR ?? process.env.CONTENT_DIR ?? '',
};

const toHeaders = (source) => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(source)) {
    if (value == null) continue;
    const lower = key.toLowerCase();
    if (['host', 'connection', 'content-length'].includes(lower)) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  return headers;
};

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : null;
};

const toWebResponse = async (response) => {
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const forward = async (req, targetBase) => {
  const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req);
  const response = await fetch(targetBase, {
    method: req.method,
    headers: toHeaders(req.headers),
    ...(body ? { body, duplex: 'half' } : {}),
  });
  return toWebResponse(response);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req);
      const request = new Request(url, {
        method: req.method,
        headers: toHeaders(req.headers),
        ...(body ? { body, duplex: 'half' } : {}),
      });
      const response = await worker.fetch(request, env, {});
      const webResponse = await toWebResponse(response);
      res.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
      if (webResponse.body) {
        res.end(Buffer.from(await webResponse.arrayBuffer()));
      } else {
        res.end();
      }
      return;
    }

    const response = await forward(req, `${ASTRO_BASE}${req.url ?? '/'}`);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (response.body) {
      res.end(Buffer.from(await response.arrayBuffer()));
    } else {
      res.end();
    }
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(error instanceof Error ? error.stack ?? error.message : String(error));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`proxy listening on http://127.0.0.1:${PORT}`);
});
