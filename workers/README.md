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
- `POST /api/admin/posts`: accepts a Markdown upload and stores the post plus optional small images in D1.
- `GET /api/posts`: returns runtime D1 posts for the browser overlay.
- `GET /api/posts/:slug`: returns one runtime D1 post.
- `GET /api/assets/*`: serves uploaded D1 image assets with long-lived cache headers.

## Private Publishing

The `/s1oop` page unlocks with a password and redirects to `/s1oop/admin`, which sends Markdown files and optional images to `POST /api/admin/posts`.
Configure this environment variable and the Cloudflare bindings before using it:

```text
ADMIN_PASSWORD=...
BLOG_DB      D1 database binding
```

Runtime publishing does not write Markdown back to GitHub. GitHub remains the source repository for code and static content.

Uploaded images are stored in `blog_assets` as D1 blobs. Keep each image at or below 1 MB.

Runtime post images are stored in D1. R2 is intentionally not required for this lightweight deployment.
