# s1oop-cloudflare-blog

Minimal Cloudflare-native blog scaffold.

This private blog uses `/s1oop` as the only hidden management entry. There is no login system, and public comments are closed.

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
│   ├── favicon.svg
│   └── images/
├── src/
│   ├── content.config.ts
│   ├── components/
│   │   ├── Comments.astro
│   │   ├── Footer.astro
│   │   ├── Header.astro
│   │   ├── PostCard.astro
│   │   ├── SearchBar.astro
│   │   └── VisitorBadge.astro
│   ├── lib/
│   │   └── posts.ts
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── s1oop.astro
│   │   ├── search.astro
│   │   ├── search-index.json.ts
│   │   ├── blog/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   │   └── tags/
│   │       ├── index.astro
│   │       └── [tag].astro
│   └── styles/
│       └── global.css
└── workers/
    ├── README.md
    ├── api.js
    ├── comments.js
    └── search.js
```

## Local Development

```sh
npm install
npm run dev
```

Open `http://localhost:4321`.

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

## Private Blog Rules

- `/s1oop` is intentionally not linked from public navigation.
- No login is implemented.
- Guest identity is generated in the browser as `游客XXXX` and stored in `localStorage`.
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

The site builds article pages, tag pages, `/blog`, `/s1oop`, and `/search-index.json` from this content.
