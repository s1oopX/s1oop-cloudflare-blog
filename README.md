# s1oop-cloudflare-blog

Cloudflare-native Astro blog with a private Markdown publishing console.

The public blog is static. `/s1oop` is a hidden password entry, and `/s1oop/admin` is the private management console for Markdown publishing, future comments, and API status. Public comments remain closed by default.

## Stack

- Astro SSG for static pages.
- TailwindCSS for responsive styling and dark mode.
- Cloudflare Pages for static deployment.
- Cloudflare Workers for optional stats and API routes.
- Cloudflare KV for optional visit counters.

## Directory Tree

```text
s1oop-cloudflare-blog/
├── astro.config.mjs
├── package.json
├── postcss.config.cjs
├── tailwind.config.cjs
├── tsconfig.json
├── content/
│   └── posts/
│       └── hello-cloudflare.md
├── public/
│   ├── favicon.png
│   └── images/
├── src/
│   ├── content.config.ts
│   ├── components/
│   │   ├── Comments.astro
│   │   ├── Footer.astro
│   │   ├── Header.astro
│   │   ├── PostCard.astro
│   │   └── SearchBar.astro
│   ├── lib/
│   │   └── posts.ts
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── s1oop.astro
│   │   ├── s1oop/
│   │   │   └── admin.astro
│   │   ├── search.astro
│   │   ├── search-index.json.ts
│   │   ├── blog/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   └── styles/
│       └── global.css
└── workers/
    ├── README.md
    └── api.js
```

## Local Development

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:4322`.

`npm run dev` starts two local processes:

- Astro dev server on `http://127.0.0.1:4322`
- Local Worker API server on `http://127.0.0.1:8787`

Astro proxies `/api/*` to the local Worker API server, so status, comments, and admin checks do not 404 in local development.

Useful split commands:

```sh
npm run dev:astro
npm run dev:api
npm run dev:proxy
```

## Build

```sh
npm run build
npm run preview
```

## Cloudflare Pages

Use these build settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: `22`

Prefer `workers/api.js` as the single Worker. Deploy separate Workers only if the API grows enough to justify splitting.

Worker config lives in `wrangler.jsonc`.

Recommended Worker routes:

```text
/api/*
```

Required Worker environment variables for private publishing:

```text
ADMIN_PASSWORD=...
GITHUB_TOKEN=...
GITHUB_OWNER=...
GITHUB_REPO=...
GITHUB_BRANCH=main
CONTENT_DIR=content/posts
```

Optional Pages environment variable:

```text
SITE_URL=https://your-domain.example
```

Optional KV binding:

```text
BLOG_KV
```

## Private Blog Rules

- `/s1oop` is intentionally not linked from public navigation.
- `/s1oop` verifies `ADMIN_PASSWORD` through `/api/admin/check`.
- `/s1oop/admin` writes Markdown posts through `/api/admin/posts` when GitHub publishing is configured.
- Public comments are closed.
- Articles are Markdown/Git-first through Astro Content Collections.
- KV is used only if you bind `BLOG_KV` for visit counters.
- R2 is optional and should only be added when large files or image uploads become necessary.

## Content

Add posts under `content/posts/`:

```md
---
title: My Post
date: 2026-04-29
excerpt: Short summary.
tags:
  - Private
draft: false
---

Post body.
```

The site builds article pages, collection pages, `/blog`, `/s1oop`, `/s1oop/admin`, `/posts.json`, and `/search-index.json` from this content.
