import { CACHE, json } from './lib/http.js';
import { handleAdminRoute } from './lib/admin-routes.js';
import { getRuntimePost, listRuntimePosts } from './lib/posts.js';
import { getCommentSettings } from './lib/settings.js';
import { assetBody } from './lib/assets.js';

const maybeHead = (request, response) => (
  request.method === 'HEAD'
    ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers })
    : response
);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const publicMethod = request.method === 'HEAD' ? 'GET' : request.method;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-methods': 'GET,HEAD,POST,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': 'authorization,content-type,x-admin-password',
          'cache-control': CACHE.noStore,
        },
      });
    }

    const adminResponse = await handleAdminRoute(request, env, url);
    if (adminResponse) return adminResponse;

    if ((url.pathname === '/api/comments' || url.pathname === '/api/comments/status') && publicMethod === 'GET') {
      const comments = await getCommentSettings(env);
      return maybeHead(request, json({
        ok: true,
        enabled: comments.enabled,
        comments: [],
      }, {
        headers: { 'cache-control': CACHE.publicList },
      }));
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

    if (url.pathname === '/api/posts' && publicMethod === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
      const includeSearch = url.searchParams.get('include') === 'search';
      return maybeHead(request, json({
        ok: true,
        source: 'd1',
        configured: Boolean(env.BLOG_DB),
        posts: await listRuntimePosts(env, limit, { includeSearch }),
      }, {
        headers: { 'cache-control': CACHE.publicList },
      }));
    }

    const postMatch = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
    if (postMatch && publicMethod === 'GET') {
      const slug = decodeURIComponent(postMatch[1]);
      const post = await getRuntimePost(env, slug);
      if (!post) return json({ ok: false, message: 'Post not found' }, { status: 404 });
      return maybeHead(request, json(
        { ok: true, source: 'd1', post },
        { headers: { 'cache-control': CACHE.publicDetail } },
      ));
    }

    if (url.pathname.startsWith('/api/assets/') && publicMethod === 'GET') {
      if (!env.BLOG_DB) {
        return json({ ok: false, message: 'D1 binding BLOG_DB is not configured' }, { status: 501 });
      }

      const key = decodeURIComponent(url.pathname.slice('/api/assets/'.length));
      const cache = globalThis.caches?.default;
      const cacheRequest = new Request(url.toString(), request);
      const cached = await cache?.match(cacheRequest).catch(() => null);
      if (cached) return maybeHead(request, cached);

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
      return maybeHead(request, response);
    }

    return json({ ok: false, message: 'Not Found' }, { status: 404 });
  },
};
