import { arrayBufferToBase64, sanitizeAssetName } from './strings.js';

const MAX_ASSET_BYTES = 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function storeImages(env, slug, files) {
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

export function rewriteMarkdownImages(markdown, rewrites) {
  if (!rewrites.size) return markdown;
  return markdown.replace(/(!\[[^\]]*]\()([^) \t]+)((?:\s+"[^"]*")?\))/g, (match, prefix, source, suffix) => {
    const basename = source.split(/[\\/]/).pop()?.toLowerCase() ?? '';
    const replacement = rewrites.get(source.toLowerCase()) || rewrites.get(basename);
    return replacement ? `${prefix}${replacement}${suffix}` : match;
  });
}

export function assetBody(value) {
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
