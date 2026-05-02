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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function sanitizeAssetName(value) {
  const fallback = `asset-${Date.now()}`;
  const cleaned = text(value)
    .split(/[\\/]/)
    .pop()
    ?.normalize('NFKD')
    .replace(/[^\w.\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

function parseScalar(value) {
  const trimmed = text(value);
  if (!trimmed) return '';
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function parseTags(value, lines, startIndex) {
  const raw = text(value);
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return {
      tags: raw.slice(1, -1).split(',').map(parseScalar).filter(Boolean),
      nextIndex: startIndex,
    };
  }

  if (raw) {
    return {
      tags: raw.split(',').map(parseScalar).filter(Boolean),
      nextIndex: startIndex,
    };
  }

  const tags = [];
  let index = startIndex + 1;
  while (index < lines.length && /^\s*-\s+/.test(lines[index])) {
    tags.push(parseScalar(lines[index].replace(/^\s*-\s+/, '')));
    index += 1;
  }

  return { tags: tags.filter(Boolean), nextIndex: index - 1 };
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\s*\n([\s\S]+?)\n---\s*\n?/);
  if (!match) {
    return { data: {}, body: markdown, error: 'Markdown must include YAML frontmatter.' };
  }

  const data = {};
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;

    const key = field[1];
    if (key === 'tags') {
      const parsed = parseTags(field[2], lines, index);
      data.tags = parsed.tags;
      index = parsed.nextIndex;
    } else if (key === 'draft') {
      data.draft = ['true', 'yes', '1'].includes(text(field[2]).toLowerCase());
    } else {
      data[key] = parseScalar(field[2]);
    }
  }

  if (!data.title) return { data, body: markdown.slice(match[0].length), error: 'Frontmatter must include title.' };
  if (!data.date) return { data, body: markdown.slice(match[0].length), error: 'Frontmatter must include date.' };

  return { data, body: markdown.slice(match[0].length), error: null };
}

function sanitizeUrl(value, allowedRelativePrefixes = ['/', '#']) {
  const url = text(value).replace(/^['"]|['"]$/g, '');
  if (!url) return '';
  if (allowedRelativePrefixes.some((prefix) => url.startsWith(prefix))) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^mailto:/i.test(url)) return url;
  return '';
}

function inlineMarkdown(value) {
  let output = escapeHtml(value);

  output = output.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]+&quot;)?\)/g, (_, alt, source) => {
    const src = sanitizeUrl(source, ['/', '#']);
    if (!src) return '';
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`;
  });
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const url = sanitizeUrl(href, ['/', '#']);
    if (!url) return label;
    return `<a href="${escapeHtml(url)}">${label}</a>`;
  });
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return output;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listOpen = false;
  let quoteOpen = false;
  let codeOpen = false;
  let codeBuffer = [];

  const closeParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listOpen) return;
    html.push('</ul>');
    listOpen = false;
  };

  const closeQuote = () => {
    if (!quoteOpen) return;
    html.push('</blockquote>');
    quoteOpen = false;
  };

  const closeBlocks = () => {
    closeParagraph();
    closeList();
    closeQuote();
  };

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (codeOpen) {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        codeOpen = false;
        codeBuffer = [];
      } else {
        closeBlocks();
        codeOpen = true;
      }
      continue;
    }

    if (codeOpen) {
      codeBuffer.push(line);
      continue;
    }

    if (!text(line)) {
      closeBlocks();
      continue;
    }

    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      closeBlocks();
      const level = Math.min(4, heading[1].length);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      closeParagraph();
      closeQuote();
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(listItem[1])}</li>`);
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      closeParagraph();
      closeList();
      if (!quoteOpen) {
        html.push('<blockquote>');
        quoteOpen = true;
      }
      html.push(`<p>${inlineMarkdown(quote[1])}</p>`);
      continue;
    }

    if (/^---+$/.test(text(line))) {
      closeBlocks();
      html.push('<hr />');
      continue;
    }

    paragraph.push(line.trim());
  }

  if (codeOpen) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }
  closeBlocks();

  return html.join('\n');
}

function readingStats(markdown) {
  const clean = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/[#>*_`~-]/g, ' ');
  const cjkCount = (clean.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWordCount = (clean.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) ?? []).length;
  const wordCount = cjkCount + latinWordCount;

  return {
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / 450)),
  };
}

function firstImage(markdown, fallbackTitle) {
  const match = markdown.match(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
  if (!match) return null;
  return {
    alt: match[1] || fallbackTitle,
    src: match[2],
  };
}

function postListItem(row) {
  const tags = JSON.parse(row.tags_json || '[]');
  return {
    slug: row.slug,
    href: `/blog/live?slug=${encodeURIComponent(row.slug)}`,
    title: row.title,
    excerpt: row.excerpt,
    date: row.date,
    tags,
    image: row.image_src ? { src: row.image_src, alt: row.image_alt || row.title } : null,
    runtime: true,
  };
}

function fullPost(row) {
  return {
    ...postListItem(row),
    markdown: row.markdown,
    html: row.html,
    wordCount: row.word_count,
    readingMinutes: row.reading_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listRuntimePosts(env, limit = 50) {
  if (!env.BLOG_DB) return [];
  const result = await env.BLOG_DB.prepare(
    `SELECT slug, title, excerpt, date, tags_json, image_src, image_alt
     FROM blog_posts
     WHERE published = 1
     ORDER BY date DESC, updated_at DESC
     LIMIT ?`,
  ).bind(limit).all();
  return (result.results ?? []).map(postListItem);
}

async function getRuntimePost(env, slug) {
  if (!env.BLOG_DB) return null;
  const row = await env.BLOG_DB.prepare(
    `SELECT slug, title, excerpt, date, tags_json, markdown, html, image_src, image_alt,
            word_count, reading_minutes, created_at, updated_at
     FROM blog_posts
     WHERE slug = ? AND published = 1`,
  ).bind(slug).first();
  return row ? fullPost(row) : null;
}

async function putRuntimePost(env, post) {
  await env.BLOG_DB.prepare(
    `INSERT INTO blog_posts (
       slug, title, excerpt, date, tags_json, markdown, html, image_src, image_alt,
       word_count, reading_minutes, published, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       excerpt = excluded.excerpt,
       date = excluded.date,
       tags_json = excluded.tags_json,
       markdown = excluded.markdown,
       html = excluded.html,
       image_src = excluded.image_src,
       image_alt = excluded.image_alt,
       word_count = excluded.word_count,
       reading_minutes = excluded.reading_minutes,
       published = excluded.published,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      post.slug,
      post.title,
      post.excerpt,
      post.date,
      JSON.stringify(post.tags),
      post.markdown,
      post.html,
      post.image?.src ?? null,
      post.image?.alt ?? null,
      post.wordCount,
      post.readingMinutes,
      post.published ? 1 : 0,
    )
    .run();
}

async function storeImages(env, slug, files) {
  if (!files.length) return { markdownRewrites: new Map(), assets: [] };
  if (!env.BLOG_IMAGES) {
    throw new Response(
      JSON.stringify({ ok: false, message: 'R2 binding BLOG_IMAGES is not configured' }),
      { status: 501, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }

  const markdownRewrites = new Map();
  const assets = [];
  for (const file of files) {
    if (!file || typeof file === 'string') continue;
    if (!file.type?.startsWith('image/')) {
      throw new Response(
        JSON.stringify({ ok: false, message: 'Only image files can be uploaded as post assets' }),
        { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } },
      );
    }

    const name = sanitizeAssetName(file.name);
    const key = `posts/${slug}/${name}`;
    await env.BLOG_IMAGES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: { originalName: file.name },
    });

    const href = `/api/assets/${key}`;
    markdownRewrites.set(name.toLowerCase(), href);
    markdownRewrites.set(`./${name}`.toLowerCase(), href);
    assets.push({ name, key, href, contentType: file.type, size: file.size });
  }

  return { markdownRewrites, assets };
}

function rewriteMarkdownImages(markdown, rewrites) {
  if (!rewrites.size) return markdown;
  return markdown.replace(/(!\[[^\]]*]\()([^) \t]+)((?:\s+"[^"]*")?\))/g, (match, prefix, source, suffix) => {
    const basename = source.split(/[\\/]/).pop()?.toLowerCase() ?? '';
    const replacement = rewrites.get(source.toLowerCase()) || rewrites.get(basename);
    return replacement ? `${prefix}${replacement}${suffix}` : match;
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

      return json({
        ok: true,
        storage: {
          d1: Boolean(env.BLOG_DB),
          r2: Boolean(env.BLOG_IMAGES),
        },
      });
    }

    if (url.pathname === '/api/admin/posts' && request.method === 'POST') {
      const auth = await verifyAdmin(request, env);
      if (!auth.ok) {
        return json({ ok: false, message: auth.message }, { status: auth.status });
      }

      if (!env.BLOG_DB) {
        return json(
          { ok: false, message: 'D1 binding BLOG_DB is not configured' },
          { status: 501 },
        );
      }

      const form = await request.formData().catch(() => null);
      const file = form?.get('file');
      const requestedSlug = form?.get('slug');
      const imageFiles = (form?.getAll('images') ?? [])
        .filter((item) => item && typeof item !== 'string' && item.name && item.size > 0);

      if (!file || typeof file === 'string') {
        return json({ ok: false, message: 'Upload a Markdown file' }, { status: 400 });
      }

      if (!file.name.toLowerCase().endsWith('.md') && !file.name.toLowerCase().endsWith('.mdx')) {
        return json({ ok: false, message: 'Only .md and .mdx files are supported' }, { status: 400 });
      }

      if (file.size > 512 * 1024) {
        return json({ ok: false, message: 'Markdown file is too large' }, { status: 400 });
      }

      const slug = toSlug(requestedSlug || file.name);
      let markdown = await file.text();

      try {
        const { markdownRewrites, assets } = await storeImages(env, slug, imageFiles);
        markdown = rewriteMarkdownImages(markdown, markdownRewrites);

        const parsed = parseFrontmatter(markdown);
        if (parsed.error) {
          return json({ ok: false, message: parsed.error }, { status: 400 });
        }

        const stats = readingStats(parsed.body);
        const image = firstImage(parsed.body, parsed.data.title);
        const html = markdownToHtml(parsed.body);
        const post = {
          slug,
          title: parsed.data.title,
          excerpt: parsed.data.excerpt || '这是一篇个人博客文章。',
          date: parsed.data.date,
          tags: parsed.data.tags ?? [],
          markdown,
          html,
          image,
          wordCount: stats.wordCount,
          readingMinutes: stats.readingMinutes,
          published: !parsed.data.draft,
        };

        await putRuntimePost(env, post);

        return json({
          ok: true,
          source: 'd1',
          slug,
          href: `/blog/live?slug=${encodeURIComponent(slug)}`,
          path: `D1:blog_posts/${slug}`,
          images: assets,
        });
      } catch (error) {
        if (error instanceof Response) return error;
        return json(
          { ok: false, message: error instanceof Error ? error.message : 'Runtime publish failed' },
          { status: 500 },
        );
      }
    }

    if (url.pathname === '/api/posts' && request.method === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
      return json({
        ok: true,
        source: 'd1',
        configured: Boolean(env.BLOG_DB),
        posts: await listRuntimePosts(env, limit),
      });
    }

    const postMatch = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
    if (postMatch && request.method === 'GET') {
      const slug = decodeURIComponent(postMatch[1]);
      const post = await getRuntimePost(env, slug);
      if (!post) return json({ ok: false, message: 'Post not found' }, { status: 404 });
      return json({ ok: true, source: 'd1', post });
    }

    if (url.pathname.startsWith('/api/assets/') && request.method === 'GET') {
      if (!env.BLOG_IMAGES) {
        return json({ ok: false, message: 'R2 binding BLOG_IMAGES is not configured' }, { status: 501 });
      }

      const key = decodeURIComponent(url.pathname.slice('/api/assets/'.length));
      const object = await env.BLOG_IMAGES.get(key);
      if (!object) return json({ ok: false, message: 'Asset not found' }, { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      headers.set('access-control-allow-origin', '*');

      return new Response(object.body, { headers });
    }

    return json({ ok: false, message: 'Not Found' }, { status: 404 });
  },
};
