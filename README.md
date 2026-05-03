# s1oop Cloudflare Blog

An Astro static blog designed for quiet long-form reading, deployed on Cloudflare Pages with Pages Functions for private runtime publishing.

Live site: <https://s1oop.bbroot.com>

## Features

- Astro static site generation.
- Markdown posts through Astro Content Collections.
- Dark archive-style visual system.
- Full archive, collection pages, search index, changelog, and article pages.
- Cloudflare Pages deployment from GitHub.
- `/api/*` functions backed by `workers/api.js`.
- Private `/s1oop/admin` publishing flow that stores new posts and small uploaded images in Cloudflare D1.
- Private admin list, delete, overwrite warning, Markdown preview, image preflight checks, and comment switch.
- GitHub remains the source repository and deployment trigger; new posts are not written back to GitHub.

## Tech Stack

- Astro 6
- TailwindCSS
- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare D1 for runtime posts and small runtime post images
- Wrangler, for Worker config validation and deployment tooling

## Local Development

```sh
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4322
```

`npm run dev` starts:

- Astro dev server on `127.0.0.1:4322`
- Local API server on `127.0.0.1:8787`

Astro proxies `/api/*` to the local API server, so local admin checks behave like the deployed Pages Functions.

Split commands are also available:

```sh
npm run dev:astro
npm run dev:api
npm run dev:proxy
```

## Environment Variables

Copy the example file and fill local-only values:

```sh
cp .dev.vars.example .dev.vars
```

`.dev.vars` is ignored by Git.

Required for private admin login:

```text
ADMIN_PASSWORD=...
```

Runtime publishing does not use GitHub write credentials. Configure these Cloudflare Pages Function bindings instead:

```text
BLOG_DB      D1 database for runtime posts and uploaded small images
```

The local Node API shim does not emulate D1. Without that binding, `/api/admin/posts` returns a clear configuration error instead of writing to GitHub.

Important local testing note:

- `npm run dev` is enough for static pages, login checks, and general API shape checks.
- Real runtime publishing, D1 post listing, D1 image serving, delete operations, and comment settings must be tested through Cloudflare Pages Functions or a Wrangler environment with `BLOG_DB` bound.
- The local shim intentionally does not create a fake D1 database, so a local upload failure with `D1 binding BLOG_DB is not configured` is expected.

Optional:

```text
SITE_URL=https://example.com
```

## Build

```sh
npm run build
npm run preview
```

The static output is written to `dist/`.

## Cloudflare Pages

Recommended Pages settings:

```text
Build command: npm run build
Build output directory: dist
Production branch: main
Node.js version: 22
```

Pages Functions live in:

```text
functions/api/[[path]].js
```

That route delegates to:

```text
workers/api.js
```

`wrangler.jsonc` contains the standalone Worker configuration for validation and future direct Worker deployment.

## Runtime Publishing

Create the D1 database in Cloudflare:

```sh
npx wrangler d1 create s1oop-blog-content
```

Apply the D1 schema:

```sh
npx wrangler d1 execute s1oop-blog-content --file migrations/0001_runtime_posts.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0002_blog_assets.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0003_site_settings.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0004_runtime_post_search_text.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0005_blog_comments.sql
```

Then bind it to the Pages project:

```text
BLOG_DB      -> s1oop-blog-content
```

`POST /api/admin/posts` accepts a Markdown file plus optional image files. The Markdown is parsed into D1 and uploaded images are stored in `blog_assets` as small base64 payloads. Each image is limited to 1 MB, so this remains lightweight and avoids R2 billing setup. The private admin page can list and delete D1 posts, check whether an upload will overwrite an existing slug, and toggle comment availability through `site_settings`. The blog archive reads `/api/posts` in the browser and prepends these runtime posts without a rebuild.

## Static Content

Add posts under `content/posts/`:

```md
---
title: My Post
date: 2026-04-29
excerpt: Short summary.
tags:
  - Blog
draft: false
---

Post body.
```

Images for static posts can be placed under `public/images/posts/` and referenced from Markdown with absolute public paths.

## Repository Notes

- The public blog is static-first with a D1 runtime overlay for newly uploaded posts.
- Public comments are disabled by default.
- The status panel is static by design; use Cloudflare Web Analytics for real analytics if needed.
- The admin publishing API requires `ADMIN_PASSWORD` and `BLOG_DB` and should only be enabled for trusted deployments.

## License

Code is released under the MIT License.

Article content and images remain copyright of their respective author unless a post or asset states otherwise.
