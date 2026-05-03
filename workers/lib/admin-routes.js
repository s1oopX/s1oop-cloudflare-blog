import { json } from './http.js';
import { clearAdminSessionCookie, createAdminSessionCookie, verifyAdmin } from './auth.js';
import { toSlug } from './strings.js';
import { firstImage, markdownToHtml, parseFrontmatter, readingStats, searchText } from './markdown.js';
import {
  countOrphanAssets,
  deleteOrphanAssets,
  deleteRuntimePost,
  getAdminRuntimePost,
  listAdminRuntimePosts,
  putRuntimePost,
} from './posts.js';
import { getCommentSettings, setSetting, SETTINGS } from './settings.js';
import { deleteUnreferencedImages, rewriteMarkdownImages, storeImages } from './assets.js';
import { deleteComment, listAdminComments } from './comments.js';

const MAX_MARKDOWN_BYTES = 512 * 1024;

const requireAdmin = async (request, env) => {
  const auth = await verifyAdmin(request, env);
  return auth.ok ? null : json(
    { ok: false, message: auth.message },
    { status: auth.status, headers: auth.headers },
  );
};

const requireD1 = (env) => (
  env.BLOG_DB
    ? null
    : json({ ok: false, message: 'D1 binding BLOG_DB is not configured' }, { status: 501 })
);

const handleSettings = async (request, env) => {
  const authResponse = await requireAdmin(request, env);
  if (authResponse) return authResponse;

  if (request.method === 'GET') {
    return json({
      ok: true,
      configured: Boolean(env.BLOG_DB),
      comments: await getCommentSettings(env),
    });
  }

  if (request.method !== 'PATCH') return null;
  const d1Response = requireD1(env);
  if (d1Response) return d1Response;

  const body = await request.json().catch(() => ({}));
  const commentsEnabled = Boolean(body.commentsEnabled);
  try {
    await setSetting(env, SETTINGS.commentsEnabled, commentsEnabled ? 'true' : 'false');
  } catch {
    return json({ ok: false, message: 'D1 settings table is not configured' }, { status: 501 });
  }

  return json({ ok: true, comments: { enabled: commentsEnabled } });
};

const handlePostUpload = async (request, env) => {
  const authResponse = await requireAdmin(request, env);
  if (authResponse) return authResponse;
  const d1Response = requireD1(env);
  if (d1Response) return d1Response;

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const requestedSlug = form?.get('slug');
  const imageFiles = (form?.getAll('images') ?? [])
    .filter((item) => item && typeof item !== 'string' && item.name && item.size > 0);

  if (!file || typeof file === 'string') return json({ ok: false, message: 'Upload a Markdown file' }, { status: 400 });
  if (!file.name.toLowerCase().endsWith('.md') && !file.name.toLowerCase().endsWith('.mdx')) {
    return json({ ok: false, message: 'Only .md and .mdx files are supported' }, { status: 400 });
  }
  if (file.size > MAX_MARKDOWN_BYTES) return json({ ok: false, message: 'Markdown file is too large' }, { status: 400 });

  const slug = toSlug(requestedSlug || file.name);
  let markdown = await file.text();

  try {
    const firstParsed = parseFrontmatter(markdown);
    if (firstParsed.error) return json({ ok: false, message: firstParsed.error }, { status: 400 });

    const existing = await getAdminRuntimePost(env, slug);
    const { markdownRewrites, assets } = await storeImages(env, slug, imageFiles);
    markdown = rewriteMarkdownImages(markdown, markdownRewrites, { slug, assets });

    const parsed = parseFrontmatter(markdown);
    if (parsed.error) return json({ ok: false, message: parsed.error }, { status: 400 });

    const stats = readingStats(parsed.body);
    const publicationDate = existing?.date || parsed.data.date;
    await putRuntimePost(env, {
      slug,
      title: parsed.data.title,
      excerpt: parsed.data.excerpt || '这是一篇个人博客文章。',
      date: publicationDate,
      tags: parsed.data.tags ?? [],
      markdown,
      html: markdownToHtml(parsed.body),
      image: firstImage(parsed.body, parsed.data.title),
      wordCount: stats.wordCount,
      readingMinutes: stats.readingMinutes,
      published: !parsed.data.draft,
      searchText: searchText(parsed.body),
    });
    if (existing && imageFiles.length) {
      await deleteUnreferencedImages(env, slug, markdown);
    }

    return json({
      ok: true,
      source: 'd1',
      slug,
      href: `/blog/live?slug=${encodeURIComponent(slug)}`,
      path: `D1:blog_posts/${slug}`,
      images: assets,
      mode: existing ? 'updated' : 'created',
      overwritten: Boolean(existing),
      publishedDate: publicationDate,
      preservedPublishedDate: Boolean(existing),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return json(
      { ok: false, message: error instanceof Error ? error.message : 'Runtime publish failed' },
      { status: 500 },
    );
  }
};

export const handleAdminRoute = async (request, env, url) => {
  if (url.pathname === '/api/admin/check' && ['GET', 'POST'].includes(request.method)) {
    const authResponse = await requireAdmin(request, env);
    if (authResponse) return authResponse;
    return json(
      { ok: true, storage: { d1: Boolean(env.BLOG_DB), assets: 'd1' } },
      request.method === 'POST' ? { headers: { 'set-cookie': await createAdminSessionCookie(env) } } : {},
    );
  }

  if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
    return json({ ok: true }, { headers: { 'set-cookie': clearAdminSessionCookie() } });
  }

  if (url.pathname === '/api/admin/settings' && ['GET', 'PATCH'].includes(request.method)) {
    return handleSettings(request, env);
  }

  if (url.pathname === '/api/admin/posts' && request.method === 'GET') {
    const authResponse = await requireAdmin(request, env);
    if (authResponse) return authResponse;
    const d1Response = requireD1(env);
    if (d1Response) return d1Response;

    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
    return json({ ok: true, source: 'd1', posts: await listAdminRuntimePosts(env, limit) });
  }

  if (url.pathname === '/api/admin/posts' && request.method === 'POST') {
    return handlePostUpload(request, env);
  }

  if (url.pathname === '/api/admin/comments' && request.method === 'GET') {
    const authResponse = await requireAdmin(request, env);
    if (authResponse) return authResponse;
    const d1Response = requireD1(env);
    if (d1Response) return d1Response;

    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
    return json({ ok: true, source: 'd1', comments: await listAdminComments(env, limit) });
  }

  const adminCommentMatch = url.pathname.match(/^\/api\/admin\/comments\/([^/]+)$/);
  if (adminCommentMatch && request.method === 'DELETE') {
    const authResponse = await requireAdmin(request, env);
    if (authResponse) return authResponse;
    const d1Response = requireD1(env);
    if (d1Response) return d1Response;

    const id = decodeURIComponent(adminCommentMatch[1]);
    const result = await deleteComment(env, id);
    if (!result.deleted) return json({ ok: false, message: 'Comment not found' }, { status: 404 });
    return json({ ok: true, id, deleted: true });
  }

  if (url.pathname === '/api/admin/assets/orphans' && ['GET', 'DELETE'].includes(request.method)) {
    const authResponse = await requireAdmin(request, env);
    if (authResponse) return authResponse;
    const d1Response = requireD1(env);
    if (d1Response) return d1Response;
    if (request.method === 'GET') return json({ ok: true, orphanAssets: await countOrphanAssets(env) });
    const result = await deleteOrphanAssets(env);
    return json({ ok: true, deleted: result.deleted });
  }

  const adminPostMatch = url.pathname.match(/^\/api\/admin\/posts\/([^/]+)$/);
  if (!adminPostMatch || !['GET', 'DELETE'].includes(request.method)) return null;

  const authResponse = await requireAdmin(request, env);
  if (authResponse) return authResponse;
  const d1Response = requireD1(env);
  if (d1Response) return d1Response;

  const slug = decodeURIComponent(adminPostMatch[1]);
  if (request.method === 'GET') {
    const post = await getAdminRuntimePost(env, slug);
    return json({ ok: true, exists: Boolean(post), post });
  }

  const result = await deleteRuntimePost(env, slug);
  if (!result.deleted) return json({ ok: false, message: 'Post not found' }, { status: 404 });
  return json({ ok: true, slug, deleted: true, assetCount: result.assetCount });
};
