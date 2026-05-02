const json = (data, init = {}) =>
  Response.json(data, {
    ...init,
    headers: {
      'access-control-allow-origin': '*',
      ...init.headers,
    },
  });

const todayKey = () => new Date().toISOString().slice(0, 10);

const text = (value) => String(value ?? '').trim();

const requireAdminPassword = (env) => {
  const password = text(env.ADMIN_PASSWORD);
  if (!password) {
    return { ok: false, status: 503, message: 'ADMIN_PASSWORD is not configured' };
  }

  return { ok: true, password };
};

async function readRequestPassword(request) {
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  const headerPassword = request.headers.get('x-admin-password');
  if (headerPassword) return headerPassword.trim();

  const body = await request.clone().json().catch(() => ({}));
  return text(body.password);
}

async function verifyAdmin(request, env) {
  const configured = requireAdminPassword(env);
  if (!configured.ok) return configured;

  const password = await readRequestPassword(request);
  if (password !== configured.password) {
    return { ok: false, status: 401, message: 'Invalid password' };
  }

  return { ok: true };
}

function toSlug(value) {
  return text(value)
    .replace(/\.[a-z0-9]+$/i, '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || `post-${Date.now()}`;
}

function toBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function validateMarkdown(markdown) {
  const frontmatter = markdown.match(/^---\s*\n([\s\S]+?)\n---/);
  if (!frontmatter) return 'Markdown must include YAML frontmatter.';
  if (!/^title:\s*.+/m.test(frontmatter[1])) return 'Frontmatter must include title.';
  if (!/^date:\s*.+/m.test(frontmatter[1])) return 'Frontmatter must include date.';
  return null;
}

function githubConfig(env) {
  const token = text(env.GITHUB_TOKEN);
  const repoSetting = text(env.GITHUB_REPO);
  const owner = text(env.GITHUB_OWNER);
  const repo = repoSetting.includes('/') ? repoSetting.split('/')[1] : repoSetting;
  const resolvedOwner = repoSetting.includes('/') ? repoSetting.split('/')[0] : owner;

  if (!token || !resolvedOwner || !repo) {
    return null;
  }

  return {
    token,
    owner: resolvedOwner,
    repo,
    branch: text(env.GITHUB_BRANCH) || 'main',
    contentDir: text(env.CONTENT_DIR) || 'content/posts',
  };
}

async function githubRequest(config, path, init = {}) {
  return fetch(`https://api.github.com/repos/${config.owner}/${config.repo}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json',
      'user-agent': 's1oop-blog-admin',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
    },
  });
}

async function readJson(kv, key, fallback) {
  if (!kv) return fallback;
  const value = await kv.get(key, 'json');
  return value ?? fallback;
}

async function writeJson(kv, key, value) {
  if (!kv) return false;
  await kv.put(key, JSON.stringify(value));
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const kv = env.BLOG_KV;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'authorization,content-type,x-admin-password',
        },
      });
    }

    if (url.pathname === '/api/comments' && request.method === 'GET') {
      const slug = url.searchParams.get('slug') ?? 'global';
      const comments = await readJson(kv, `comments:${slug}`, []);

      return json({
        ok: true,
        enabled: env.COMMENTS_ENABLED === 'true',
        comments,
      });
    }

    if (url.pathname === '/api/comments' && request.method === 'POST') {
      return json(
        {
          ok: false,
          enabled: false,
          message: 'Public comments are closed for this private blog',
        },
        { status: 403 },
      );
    }

    if (url.pathname === '/api/stats/visit' && request.method === 'POST') {
      if (!kv) {
        return json({
          ok: true,
          persisted: false,
          message: 'BLOG_KV is not bound. Static site remains fully functional',
        });
      }

      const body = await request.json().catch(() => ({}));
      const visitorId = String(body.visitorId ?? 'anonymous').slice(0, 64);
      const path = String(body.path ?? '/').slice(0, 256);
      const day = todayKey();
      const stats = await readJson(kv, `stats:daily:${day}`, {
        pageViews: 0,
        visitors: [],
        paths: {},
      });

      stats.pageViews += 1;
      if (!stats.visitors.includes(visitorId)) stats.visitors.push(visitorId);
      stats.paths[path] = (stats.paths[path] ?? 0) + 1;

      await writeJson(kv, `stats:daily:${day}`, stats);

      return json({
        ok: true,
        persisted: true,
        pageViews: stats.pageViews,
        visitors: stats.visitors.length,
      });
    }

    if (url.pathname === '/api/stats' && request.method === 'GET') {
      const day = url.searchParams.get('day') ?? todayKey();
      const stats = await readJson(kv, `stats:daily:${day}`, {
        pageViews: 0,
        visitors: [],
        paths: {},
      });

      return json({
        ok: true,
        persisted: Boolean(kv),
        day,
        pageViews: stats.pageViews,
        visitors: stats.visitors.length,
        paths: stats.paths,
      });
    }

    if (url.pathname === '/api/admin/check' && request.method === 'POST') {
      const auth = await verifyAdmin(request, env);
      if (!auth.ok) {
        return json({ ok: false, message: auth.message }, { status: auth.status });
      }

      return json({ ok: true });
    }

    if (url.pathname === '/api/admin/posts' && request.method === 'POST') {
      const auth = await verifyAdmin(request, env);
      if (!auth.ok) {
        return json({ ok: false, message: auth.message }, { status: auth.status });
      }

      const config = githubConfig(env);
      if (!config) {
        return json(
          {
            ok: false,
            message: 'GitHub publishing is not configured. Set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO and GITHUB_BRANCH',
          },
          { status: 501 },
        );
      }

      const form = await request.formData().catch(() => null);
      const file = form?.get('file');
      const requestedSlug = form?.get('slug');

      if (!file || typeof file === 'string') {
        return json({ ok: false, message: 'Upload a Markdown file' }, { status: 400 });
      }

      const extension = file.name.toLowerCase().endsWith('.mdx') ? 'mdx' : 'md';
      if (!file.name.toLowerCase().endsWith('.md') && !file.name.toLowerCase().endsWith('.mdx')) {
        return json({ ok: false, message: 'Only .md and .mdx files are supported' }, { status: 400 });
      }

      if (file.size > 512 * 1024) {
        return json({ ok: false, message: 'Markdown file is too large' }, { status: 400 });
      }

      const markdown = await file.text();
      const invalid = validateMarkdown(markdown);
      if (invalid) {
        return json({ ok: false, message: invalid }, { status: 400 });
      }

      const slug = toSlug(requestedSlug || file.name);
      const path = `${config.contentDir.replace(/\/+$/g, '')}/${slug}.${extension}`;
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');

      let sha;
      const existing = await githubRequest(config, `/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`);
      if (existing.ok) {
        const body = await existing.json();
        sha = body.sha;
      } else if (existing.status !== 404) {
        return json({ ok: false, message: 'Could not check existing GitHub file' }, { status: 502 });
      }

      const response = await githubRequest(config, `/contents/${encodedPath}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Publish post: ${slug}`,
          content: toBase64(markdown),
          branch: config.branch,
          ...(sha ? { sha } : {}),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return json(
          { ok: false, message: result.message || 'GitHub publish failed' },
          { status: 502 },
        );
      }

      return json({
        ok: true,
        path,
        commit: result.commit?.sha ?? null,
        url: result.content?.html_url ?? null,
      });
    }

    if (url.pathname === '/api/posts' && request.method === 'GET') {
      return json({
        ok: true,
        source: 'static',
        index: '/posts.json',
      });
    }

    return json({ ok: false, message: 'Not Found' }, { status: 404 });
  },
};
