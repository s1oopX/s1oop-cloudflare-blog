# Workers

`api.js` is the preferred Worker. Keep one Worker and route by pathname.

Local development is wired through the project dev script:

```sh
npm run dev
```

This starts Astro on `127.0.0.1:4322` and a local Worker API server on `127.0.0.1:8787`. Astro proxies `/api/*` to the local API server.

Cloudflare deployment configuration lives in `wrangler.jsonc`.

## Reserved Routes

- `GET /api/comments`: returns the closed comment state and any stored comments if KV exists.
- `POST /api/comments`: blocked because public comments are closed.
- `POST /api/stats/visit`: records a daily counter when `BLOG_KV` is bound.
- `GET /api/stats`: returns the daily counter when `BLOG_KV` is bound, otherwise zeros.
- `POST /api/admin/check`: verifies the private `/s1oop` password.
- `POST /api/admin/posts`: accepts a Markdown upload, stores the post in D1, and stores optional images in R2.
- `GET /api/posts`: returns runtime D1 posts for the browser overlay.
- `GET /api/posts/:slug`: returns one runtime D1 post.
- `GET /api/assets/*`: serves uploaded R2 assets.

## Private Publishing

The `/s1oop` page unlocks with a password and redirects to `/s1oop/admin`, which sends Markdown files and optional images to `POST /api/admin/posts`.
Configure this environment variable and the Cloudflare bindings before using it:

```text
ADMIN_PASSWORD=...
BLOG_DB      D1 database binding
BLOG_IMAGES  R2 bucket binding
```

Runtime publishing does not write Markdown back to GitHub. GitHub remains the source repository for code and static content.

## Optional KV Binding

When comments or stats are enabled later, bind one KV namespace as:

```text
BLOG_KV
```

Suggested keys:

```text
comments:{slug}
stats:daily:{yyyy-mm-dd}
settings:site
```

Runtime post images are stored in R2 when `BLOG_IMAGES` is bound.
