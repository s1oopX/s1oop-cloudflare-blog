const MAX_AUTHOR_LENGTH = 32;
const MIN_BODY_LENGTH = 5;
const MAX_BODY_LENGTH = 30;
const MAX_URL_LENGTH = 160;
const MAX_COMMENTS_PER_IP = 2;
const COMMENT_COOLDOWN_SECONDS = 60;
const PUBLIC_COMMENT_LIMIT = 50;
const ADMIN_COMMENT_LIMIT = 100;

const cleanText = (value, limit) => String(value ?? '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const cleanBody = (value) => String(value ?? '')
  .replace(/\r\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const cleanSlug = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '')
  .slice(0, 96);

const cleanUrl = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (raw.length > MAX_URL_LENGTH) throw new Error('Author URL is too long');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Author URL must use http or https');
  return url.toString();
};

const cleanHref = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 180) return null;
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
};

const publicComment = (row) => ({
  id: row.id,
  postSlug: row.post_slug,
  postHref: row.post_href || null,
  authorName: row.author_name,
  authorUrl: row.author_url || null,
  body: row.body,
  createdAt: row.created_at,
});

const adminComment = (row) => ({
  ...publicComment(row),
  approved: Boolean(row.approved),
  userAgent: row.user_agent || null,
});

const commentsUnavailable = (error) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('no such table: blog_comments');
};

const toHex = (buffer) => [...new Uint8Array(buffer)]
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');

const ipHash = async (env, request) => {
  const ip = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'local';
  const secret = env.ADMIN_PASSWORD || 's1oop-comments';
  const data = new TextEncoder().encode(`${secret}:${ip}`);
  return toHex(await crypto.subtle.digest('SHA-256', data));
};

export async function listComments(env, slug, limit = PUBLIC_COMMENT_LIMIT) {
  if (!env.BLOG_DB) return [];
  const postSlug = cleanSlug(slug);
  if (!postSlug) return [];

  try {
    const result = await env.BLOG_DB.prepare(
      `SELECT id, post_slug, post_href, author_name, author_url, body, created_at
       FROM blog_comments
       WHERE post_slug = ? AND approved = 1
       ORDER BY created_at DESC
       LIMIT ?`,
    ).bind(postSlug, Math.min(PUBLIC_COMMENT_LIMIT, Math.max(1, Number(limit) || PUBLIC_COMMENT_LIMIT))).all();
    return (result.results ?? []).map(publicComment);
  } catch (error) {
    if (commentsUnavailable(error)) return [];
    throw error;
  }
}

export async function listAdminComments(env, limit = ADMIN_COMMENT_LIMIT) {
  if (!env.BLOG_DB) return [];

  try {
    const result = await env.BLOG_DB.prepare(
      `SELECT id, post_slug, post_href, author_name, author_url, body, approved, user_agent, created_at
       FROM blog_comments
       ORDER BY created_at DESC
       LIMIT ?`,
    ).bind(Math.min(ADMIN_COMMENT_LIMIT, Math.max(1, Number(limit) || ADMIN_COMMENT_LIMIT))).all();
    return (result.results ?? []).map(adminComment);
  } catch (error) {
    if (commentsUnavailable(error)) return [];
    throw error;
  }
}

export async function createComment(env, request) {
  if (!env.BLOG_DB) {
    return { error: 'D1 binding BLOG_DB is not configured', status: 501 };
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return { error: 'Invalid comment content type', status: 415 };
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 8192) return { error: 'Comment payload is too large', status: 413 };

  const input = await request.json().catch(() => null);
  if (!input || typeof input !== 'object') return { error: 'Invalid comment payload', status: 400 };
  if (String(input.website ?? '').trim()) return { error: 'Comment rejected', status: 400 };

  const postSlug = cleanSlug(input.postSlug || input.slug);
  const postHref = cleanHref(input.postHref || input.href);
  const authorName = cleanText(input.authorName || input.name, MAX_AUTHOR_LENGTH);
  const body = cleanBody(input.body || input.comment);
  let authorUrl = null;

  try {
    authorUrl = cleanUrl(input.authorUrl || input.url);
  } catch (error) {
    return { error: error.message, status: 400 };
  }

  if (!postSlug) return { error: 'Post slug is required', status: 400 };
  if (authorName.length < 1) return { error: 'Name is required', status: 400 };
  if (body.length < MIN_BODY_LENGTH || body.length > MAX_BODY_LENGTH) {
    return { error: '留言需要 5 到 30 个字', status: 400 };
  }

  const comment = {
    id: crypto.randomUUID(),
    postSlug,
    postHref,
    authorName,
    authorUrl,
    body,
    userAgent: cleanText(request.headers.get('user-agent'), 180) || null,
    ipHash: await ipHash(env, request),
  };

  try {
    const existing = await env.BLOG_DB.prepare(
      'SELECT COUNT(*) AS count FROM blog_comments WHERE ip_hash = ?',
    ).bind(comment.ipHash).first();
    if (Number(existing?.count ?? 0) >= MAX_COMMENTS_PER_IP) {
      return { error: '同一网络最多留言 2 条', status: 429 };
    }

    const recent = await env.BLOG_DB.prepare(
      `SELECT id FROM blog_comments
       WHERE ip_hash = ? AND created_at >= datetime('now', ?)
       LIMIT 1`,
    ).bind(comment.ipHash, `-${COMMENT_COOLDOWN_SECONDS} seconds`).first();
    if (recent) {
      return { error: '留言太频繁，请稍后再试', status: 429 };
    }

    await env.BLOG_DB.prepare(
      `INSERT INTO blog_comments (
         id, post_slug, post_href, author_name, author_url, body, approved, user_agent, ip_hash, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)`,
    )
      .bind(
        comment.id,
        comment.postSlug,
        comment.postHref,
        comment.authorName,
        comment.authorUrl,
        comment.body,
        comment.userAgent,
        comment.ipHash,
      )
      .run();
  } catch (error) {
    if (commentsUnavailable(error)) return { error: 'D1 comments table is not configured', status: 501 };
    throw error;
  }

  return {
    comment: {
      id: comment.id,
      postSlug: comment.postSlug,
      postHref: comment.postHref,
      authorName: comment.authorName,
      authorUrl: comment.authorUrl,
      body: comment.body,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function deleteComment(env, id) {
  if (!env.BLOG_DB) return { deleted: false };
  const commentId = String(id ?? '').trim();
  if (!commentId) return { deleted: false };

  const existing = await env.BLOG_DB.prepare(
    'SELECT id FROM blog_comments WHERE id = ?',
  ).bind(commentId).first();
  if (!existing) return { deleted: false };

  await env.BLOG_DB.prepare('DELETE FROM blog_comments WHERE id = ?').bind(commentId).run();
  return { deleted: true };
}
