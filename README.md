# s1oop Cloudflare Blog

An Astro static blog designed for quiet long-form reading, deployed on Cloudflare Pages with optional Pages Functions for stats, comments, and private Markdown publishing.

Live site: <https://s1oop.bbroot.com>

## Features

- Astro static site generation.
- Markdown posts through Astro Content Collections.
- Dark archive-style visual system.
- Full archive, collection pages, search index, changelog, and article pages.
- Cloudflare Pages deployment from GitHub.
- Optional `/api/*` functions backed by `workers/api.js`.
- Optional private `/s1oop/admin` publishing flow when GitHub API credentials are configured.

## Tech Stack

- Astro 6
- TailwindCSS
- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare KV, optional
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

Astro proxies `/api/*` to the local API server, so local stats, comments, and admin checks behave like the deployed Pages Functions.

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

Required only if `/s1oop/admin` should publish Markdown files back to GitHub:

```text
GITHUB_TOKEN=...
GITHUB_OWNER=...
GITHUB_REPO=...
GITHUB_BRANCH=main
CONTENT_DIR=content/posts
```

Optional:

```text
COMMENTS_ENABLED=false
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

## Content

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

Images can be placed under `public/images/posts/` and referenced from Markdown with absolute public paths.

## Repository Notes

- The public blog is static-first.
- Public comments are disabled by default.
- Visit stats work without KV, but are not persisted until `BLOG_KV` is bound.
- The admin publishing API requires GitHub credentials and should only be enabled for trusted deployments.

## License

Code is released under the MIT License.

Article content and images remain copyright of their respective author unless a post or asset states otherwise.
