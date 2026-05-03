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

function publicFullPost(row) {
  const post = fullPost(row);
  delete post.markdown;
  return post;
}

export async function listRuntimePosts(env, limit = 50, options = {}) {
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

export async function listAdminRuntimePosts(env, limit = 50) {
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

export async function getRuntimePost(env, slug) {
  if (!env.BLOG_DB) return null;
  const row = await env.BLOG_DB.prepare(
    `SELECT slug, title, excerpt, date, tags_json, markdown, html, image_src, image_alt,
            word_count, reading_minutes, created_at, updated_at
     FROM blog_posts
     WHERE slug = ? AND published = 1`,
  ).bind(slug).first();
  return row ? publicFullPost(row) : null;
}

export async function getAdminRuntimePost(env, slug) {
  if (!env.BLOG_DB) return null;
  const row = await env.BLOG_DB.prepare(
    `SELECT slug, title, excerpt, date, tags_json, markdown, html, image_src, image_alt,
            word_count, reading_minutes, published, created_at, updated_at
     FROM blog_posts
     WHERE slug = ?`,
  ).bind(slug).first();
  return row ? { ...fullPost(row), published: Boolean(row.published) } : null;
}

export async function deleteRuntimePost(env, slug) {
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

export async function countOrphanAssets(env) {
  const row = await env.BLOG_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM blog_assets
     WHERE slug NOT IN (SELECT slug FROM blog_posts)`,
  ).first();
  return Number(row?.count ?? 0);
}

export async function deleteOrphanAssets(env) {
  const count = await countOrphanAssets(env);
  if (count > 0) {
    await env.BLOG_DB.prepare(
      `DELETE FROM blog_assets
       WHERE slug NOT IN (SELECT slug FROM blog_posts)`,
    ).run();
  }
  return { deleted: count };
}

export async function putRuntimePost(env, post) {
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
