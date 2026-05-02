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
- `POST /api/admin/posts`: accepts a Markdown upload and writes it to the GitHub content source.
- `GET /api/posts`: points clients to the static `/posts.json` index.

## Private Publishing

The `/s1oop` page unlocks with a password and redirects to `/s1oop/admin`, which sends Markdown files to `POST /api/admin/posts`.
Configure these Worker environment variables before using it:

```text
ADMIN_PASSWORD=...
GITHUB_TOKEN=...
GITHUB_OWNER=...
GITHUB_REPO=...
GITHUB_BRANCH=main
CONTENT_DIR=content/posts
```

`GITHUB_TOKEN` needs permission to write repository contents. When the repository is connected to
Cloudflare Pages, the commit created by the Worker can trigger the normal Pages rebuild.

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

Do not add R2 until image uploads or large files are actually needed.
