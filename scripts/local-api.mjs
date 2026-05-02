import http from 'node:http';
import fs from 'node:fs/promises';
import worker from '../workers/api.js';

const ROOT = new URL('..', import.meta.url);
const PORT = Number(process.env.API_PORT ?? 8787);

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
  COMMENTS_ENABLED: devVars.COMMENTS_ENABLED ?? process.env.COMMENTS_ENABLED ?? 'false',
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

const sendWebResponse = async (res, response) => {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    res.end(Buffer.from(await response.arrayBuffer()));
  } else {
    res.end();
  }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  try {
    const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req);
    const request = new Request(url, {
      method: req.method,
      headers: toHeaders(req.headers),
      ...(body ? { body, duplex: 'half' } : {}),
    });

    const response = await worker.fetch(request, env, {});
    await sendWebResponse(res, response);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(error instanceof Error ? error.stack ?? error.message : String(error));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`local api listening on http://127.0.0.1:${PORT}`);
});
