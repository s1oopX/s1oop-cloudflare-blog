# Workers

`api.js` is the preferred Worker. Keep one Worker and route by pathname.

Local development is wired through the project dev script:

```sh
npm run dev
```

This starts Astro on `127.0.0.1:4322` and a local Worker API server on `127.0.0.1:8787`. Astro proxies `/api/*` to the local API server.

Cloudflare deployment configuration lives in `wrangler.jsonc`.

## Reserved Routes

- `POST /api/admin/check`: verifies the private `/s1oop` password.
- `GET /api/admin/posts`: lists runtime D1 posts for the private admin page.
- `POST /api/admin/posts`: accepts a Markdown upload and stores the post plus optional small images in D1.
- `GET /api/admin/posts/:slug`: checks whether a runtime post exists before upload.
- `DELETE /api/admin/posts/:slug`: deletes a runtime post and its D1 image assets.
- `GET /api/admin/assets/orphans`: counts D1 image assets that no longer belong to a post.
- `DELETE /api/admin/assets/orphans`: deletes orphaned D1 image assets.
- `GET /api/admin/comments`: lists stored comments for moderation.
- `DELETE /api/admin/comments/:id`: deletes one stored comment.
- `GET /api/admin/settings`: reads private runtime settings.
- `PATCH /api/admin/settings`: updates runtime settings such as the comment switch.
- `GET /api/comments` and `GET /api/comments/status`: expose the current public comment switch and stored comments.
- `POST /api/comments`: stores a public comment when comments are enabled. Each IP hash is limited to 2 comments.
- `GET /api/posts`: returns D1 posts for public archive, collection, search, and recommendation views.
- `GET /api/posts/:slug`: returns one runtime D1 post.
- `GET /api/assets/*`: serves uploaded D1 image assets with long-lived cache headers.

## Private Publishing

The `/s1oop` page unlocks with a password and redirects to `/s1oop/admin`, which sends Markdown files and optional images to `POST /api/admin/posts`.
Configure this environment variable and the Cloudflare bindings before using it:

```text
ADMIN_PASSWORD=...
BLOG_DB      D1 database binding
```

Runtime publishing does not write Markdown back to GitHub. GitHub remains the source repository for code and page shells.

Uploaded images are stored in `blog_assets` as small base64 payloads. Keep each image at or below 1 MB.
The private admin page compresses JPEG, PNG, and WebP uploads in the browser before sending them to D1. GIF uploads are kept as-is.

Runtime post images are stored in D1. R2 is intentionally not required for this lightweight deployment.

Apply all migrations before enabling the admin page in production:

```sh
npx wrangler d1 execute s1oop-blog-content --file migrations/0001_runtime_posts.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0002_blog_assets.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0003_site_settings.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0004_runtime_post_search_text.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0005_blog_comments.sql
```
