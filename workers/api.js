const CACHE = {
  noStore: 'no-store',
  publicList: 'public, max-age=30, stale-while-revalidate=120',
  publicDetail: 'public, max-age=10, stale-while-revalidate=60',
  publicAsset: 'public, max-age=31536000, immutable',
};

const json = (data, init = {}) =>
  Response.json(data, {
    ...init,
    headers: {
      'cache-control': CACHE.noStore,
      ...init.headers,
    },
  });

const text = (value) => String(value ?? '').trim();
const MAX_MARKDOWN_BYTES = 512 * 1024;
const MAX_ASSET_BYTES = 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const SETTINGS = {
  commentsEnabled: 'comments.enabled',
};

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
  if (!timingSafeEqual(password, configured.password)) {
    return { ok: false, status: 401, message: 'Invalid password' };
  }

  return { ok: true };
}

function timingSafeEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(String(left ?? ''));
  const rightBytes = encoder.encode(String(right ?? ''));
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
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

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
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

function searchText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1 ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1 ')
    .replace(/[#>*_`~|[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
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
  const post = {
    slug: row.slug,
    href: `/blog/live?slug=${encodeURIComponent(row.slug)}`,
    title: row.title,
    excerpt: row.excerpt,
    date: row.date,
    tags,
    image: row.image_src ? { src: row.image_src, alt: row.image_alt || row.title } : null,
    runtime: true,
  };

  if ('search_text' in row) post.body = row.search_text || '';
  return post;
}

function adminPostListItem(row) {
  return {
    ...postListItem(row),
    published: Boolean(row.published),
    wordCount: row.word_count ?? 0,
    readingMinutes: row.reading_minutes ?? 1,
    imageCount: row.image_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

async function listRuntimePosts(env, limit = 50, options = {}) {
  if (!env.BLOG_DB) return [];
  const includeSearch = Boolean(options.includeSearch);
  const fields = includeSearch
    ? 'slug, title, excerpt, date, tags_json, image_src, image_alt, search_text'
    : 'slug, title, excerpt, date, tags_json, image_src, image_alt';
  const result = await env.BLOG_DB.prepare(
    `SELECT ${fields}
     FROM blog_posts
     WHERE published = 1
     ORDER BY date DESC, updated_at DESC
     LIMIT ?`,
  ).bind(limit).all();
  return (result.results ?? []).map(postListItem);
}

async function listAdminRuntimePosts(env, limit = 50) {
  if (!env.BLOG_DB) return [];
  const result = await env.BLOG_DB.prepare(
    `SELECT slug, title, excerpt, date, tags_json, image_src, image_alt,
            word_count, reading_minutes, published, created_at, updated_at,
            (
              SELECT COUNT(*)
              FROM blog_assets
              WHERE blog_assets.slug = blog_posts.slug
            ) AS image_count
     FROM blog_posts
     ORDER BY date DESC, updated_at DESC
     LIMIT ?`,
  ).bind(limit).all();
  return (result.results ?? []).map(adminPostListItem);
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

async function getAdminRuntimePost(env, slug) {
  if (!env.BLOG_DB) return null;
  const row = await env.BLOG_DB.prepare(
    `SELECT slug, title, excerpt, date, tags_json, markdown, html, image_src, image_alt,
            word_count, reading_minutes, published, created_at, updated_at
     FROM blog_posts
     WHERE slug = ?`,
  ).bind(slug).first();
  return row ? { ...fullPost(row), published: Boolean(row.published) } : null;
}

async function deleteRuntimePost(env, slug) {
  const existing = await getAdminRuntimePost(env, slug);
  if (!existing) return { deleted: false, assetCount: 0 };

  const assets = await env.BLOG_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM blog_assets
     WHERE slug = ?`,
  ).bind(slug).first();

  await env.BLOG_DB.prepare('DELETE FROM blog_assets WHERE slug = ?').bind(slug).run();
  await env.BLOG_DB.prepare('DELETE FROM blog_posts WHERE slug = ?').bind(slug).run();

  return { deleted: true, assetCount: assets?.count ?? 0 };
}

async function countOrphanAssets(env) {
  const row = await env.BLOG_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM blog_assets
     WHERE slug NOT IN (SELECT slug FROM blog_posts)`,
  ).first();
  return Number(row?.count ?? 0);
}

async function deleteOrphanAssets(env) {
  const count = await countOrphanAssets(env);
  if (count > 0) {
    await env.BLOG_DB.prepare(
      `DELETE FROM blog_assets
       WHERE slug NOT IN (SELECT slug FROM blog_posts)`,
    ).run();
  }
  return { deleted: count };
}

async function putRuntimePost(env, post) {
  await env.BLOG_DB.prepare(
    `INSERT INTO blog_posts (
       slug, title, excerpt, date, tags_json, markdown, html, image_src, image_alt,
       word_count, reading_minutes, published, search_text, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
       search_text = excluded.search_text,
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
      post.searchText,
    )
    .run();
}

async function getSetting(env, key, fallback) {
  if (!env.BLOG_DB) return fallback;
  try {
    const row = await env.BLOG_DB.prepare(
      'SELECT value FROM site_settings WHERE key = ?',
    ).bind(key).first();
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

async function setSetting(env, key, value) {
  await env.BLOG_DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(key, value).run();
}

async function getCommentSettings(env) {
  const enabled = await getSetting(env, SETTINGS.commentsEnabled, 'false');
  return {
    enabled: enabled === 'true',
  };
}

async function storeImages(env, slug, files) {
  if (!files.length) return { markdownRewrites: new Map(), assets: [] };

  const markdownRewrites = new Map();
  const assets = [];
  const names = new Map();
  for (const file of files) {
    if (!file || typeof file === 'string') continue;
    if (!IMAGE_TYPES.has(file.type)) {
      throw new Response(
        JSON.stringify({ ok: false, message: 'Only JPEG, PNG, WebP and GIF images are supported' }),
        { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } },
      );
    }

    if (file.size > MAX_ASSET_BYTES) {
      throw new Response(
        JSON.stringify({ ok: false, message: 'Each image must be 1 MB or smaller' }),
        { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } },
      );
    }

    const originalName = sanitizeAssetName(file.name);
    const count = names.get(originalName) ?? 0;
    names.set(originalName, count + 1);
    const name = count ? originalName.replace(/(\.[^.]+)?$/, `-${count + 1}$1`) : originalName;
    const key = `posts/${slug}/${name}`;
    const body = arrayBufferToBase64(await file.arrayBuffer());

    await env.BLOG_DB.prepare(
      `INSERT INTO blog_assets (key, slug, filename, content_type, body, byte_length, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET
         slug = excluded.slug,
         filename = excluded.filename,
         content_type = excluded.content_type,
         body = excluded.body,
         byte_length = excluded.byte_length,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(key, slug, name, file.type, body, file.size).run();

    const href = `/api/assets/${key}`;
    markdownRewrites.set(originalName.toLowerCase(), href);
    markdownRewrites.set(`./${originalName}`.toLowerCase(), href);
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

function assetBody(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value;
  if (typeof value === 'string') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return value;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': 'authorization,content-type,x-admin-password',
          'cache-control': CACHE.noStore,
        },
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
          assets: 'd1',
        },
      });
    }

    if (url.pathname === '/api/admin/settings' && request.method === 'GET') {
      const auth = await verifyAdmin(request, env);
      if (!auth.ok) {
        return json({ ok: false, message: auth.message }, { status: auth.status });
      }

      return json({
        ok: true,
        configured: Boolean(env.BLOG_DB),
        comments: await getCommentSettings(env),
      });
    }

    if (url.pathname === '/api/admin/settings' && request.method === 'PATCH') {
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

      const body = await request.json().catch(() => ({}));
      const commentsEnabled = Boolean(body.commentsEnabled);

      try {
        await setSetting(env, SETTINGS.commentsEnabled, commentsEnabled ? 'true' : 'false');
      } catch {
        return json(
          { ok: false, message: 'D1 settings table is not configured' },
          { status: 501 },
        );
      }

      return json({
        ok: true,
        comments: { enabled: commentsEnabled },
      });
    }

    if (url.pathname === '/api/admin/posts' && request.method === 'GET') {
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

      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
      return json({
        ok: true,
        source: 'd1',
        posts: await listAdminRuntimePosts(env, limit),
      });
    }

    if (url.pathname === '/api/admin/assets/orphans' && request.method === 'GET') {
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

      return json({
        ok: true,
        orphanAssets: await countOrphanAssets(env),
      });
    }

    if (url.pathname === '/api/admin/assets/orphans' && request.method === 'DELETE') {
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

      const result = await deleteOrphanAssets(env);
      return json({
        ok: true,
        deleted: result.deleted,
      });
    }

    const adminPostMatch = url.pathname.match(/^\/api\/admin\/posts\/([^/]+)$/);
    if (adminPostMatch && request.method === 'GET') {
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

      const slug = decodeURIComponent(adminPostMatch[1]);
      const post = await getAdminRuntimePost(env, slug);
      return json({ ok: true, exists: Boolean(post), post });
    }

    if (adminPostMatch && request.method === 'DELETE') {
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

      const slug = decodeURIComponent(adminPostMatch[1]);
      const result = await deleteRuntimePost(env, slug);
      if (!result.deleted) {
        return json({ ok: false, message: 'Post not found' }, { status: 404 });
      }

      return json({
        ok: true,
        slug,
        deleted: true,
        assetCount: result.assetCount,
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

      if (file.size > MAX_MARKDOWN_BYTES) {
        return json({ ok: false, message: 'Markdown file is too large' }, { status: 400 });
      }

      const slug = toSlug(requestedSlug || file.name);
      let markdown = await file.text();

      try {
        const firstParsed = parseFrontmatter(markdown);
        if (firstParsed.error) {
          return json({ ok: false, message: firstParsed.error }, { status: 400 });
        }

        const existing = await getAdminRuntimePost(env, slug);
        if (existing) {
          await env.BLOG_DB.prepare('DELETE FROM blog_assets WHERE slug = ?').bind(slug).run();
        }

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
          searchText: searchText(parsed.body),
        };

        await putRuntimePost(env, post);

        return json({
          ok: true,
          source: 'd1',
          slug,
          href: `/blog/live?slug=${encodeURIComponent(slug)}`,
          path: `D1:blog_posts/${slug}`,
          images: assets,
          mode: existing ? 'updated' : 'created',
          overwritten: Boolean(existing),
        });
      } catch (error) {
        if (error instanceof Response) return error;
        return json(
          { ok: false, message: error instanceof Error ? error.message : 'Runtime publish failed' },
          { status: 500 },
        );
      }
    }

    if ((url.pathname === '/api/comments' || url.pathname === '/api/comments/status') && request.method === 'GET') {
      const comments = await getCommentSettings(env);
      return json({
        ok: true,
        enabled: comments.enabled,
        comments: [],
      }, {
        headers: { 'cache-control': CACHE.publicList },
      });
    }

    if (url.pathname === '/api/comments' && request.method === 'POST') {
      const comments = await getCommentSettings(env);
      if (!comments.enabled) {
        return json(
          { ok: false, enabled: false, message: 'Comments are closed' },
          { status: 403 },
        );
      }

      return json(
        { ok: false, enabled: true, message: 'Comment storage is not configured' },
        { status: 501 },
      );
    }

    if (url.pathname === '/api/posts' && request.method === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
      const includeSearch = url.searchParams.get('include') === 'search';
      return json({
        ok: true,
        source: 'd1',
        configured: Boolean(env.BLOG_DB),
        posts: await listRuntimePosts(env, limit, { includeSearch }),
      }, {
        headers: { 'cache-control': CACHE.publicList },
      });
    }

    const postMatch = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
    if (postMatch && request.method === 'GET') {
      const slug = decodeURIComponent(postMatch[1]);
      const post = await getRuntimePost(env, slug);
      if (!post) return json({ ok: false, message: 'Post not found' }, { status: 404 });
      return json(
        { ok: true, source: 'd1', post },
        { headers: { 'cache-control': CACHE.publicDetail } },
      );
    }

    if (url.pathname.startsWith('/api/assets/') && request.method === 'GET') {
      if (!env.BLOG_DB) {
        return json({ ok: false, message: 'D1 binding BLOG_DB is not configured' }, { status: 501 });
      }

      const key = decodeURIComponent(url.pathname.slice('/api/assets/'.length));
      const cache = globalThis.caches?.default;
      const cacheRequest = new Request(url.toString(), request);
      const cached = await cache?.match(cacheRequest).catch(() => null);
      if (cached) return cached;

      const object = await env.BLOG_DB.prepare(
        `SELECT content_type, body, byte_length, updated_at
         FROM blog_assets
         WHERE key = ?`,
      ).bind(key).first();
      if (!object) return json({ ok: false, message: 'Asset not found' }, { status: 404 });

      const headers = new Headers();
      headers.set('content-type', object.content_type || 'application/octet-stream');
      headers.set('content-length', String(object.byte_length || 0));
      headers.set('cache-control', CACHE.publicAsset);

      const response = new Response(assetBody(object.body), { headers });
      await cache?.put(cacheRequest, response.clone()).catch(() => {});
      return response;
    }

    return json({ ok: false, message: 'Not Found' }, { status: 404 });
  },
};
