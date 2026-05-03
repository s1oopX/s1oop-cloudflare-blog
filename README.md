# s1oop Cloudflare Blog

An Astro site for quiet long-form reading. Public pages are static shells deployed on Cloudflare Pages, while all public posts are stored in Cloudflare D1 and served through Pages Functions.

Live site: <https://s1oop.bbroot.com>

## Architecture

- Astro builds the static page shells in `dist/`.
- Cloudflare Pages serves the frontend.
- Pages Functions route `/api/*` to `workers/api.js`.
- D1 is the only public article source.
- The single article reader is `/blog/live?slug=...`.
- Archive, collection, search, home entry, and recommendations read `/api/posts` in the browser.
- GitHub stores code, design, scripts, and docs. Public posts are not written back to the repository.

## Features

- Dark archive-style visual system.
- Full archive, curated collection pages, search, changelog, and about page.
- Private `/s1oop/admin` publishing flow for Markdown uploads.
- D1-backed post list, post detail, delete, overwrite warning, Markdown preview, image preflight, and comments switch.
- Small uploaded images are stored in D1 `blog_assets`; R2 is not required.
- Public comments can be enabled from the private admin page.

## Tech Stack

- Astro 6
- TailwindCSS
- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare D1
- Wrangler for Worker config validation

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
- A proxy so Astro can call `/api/*`

Split commands are also available:

```sh
npm run dev:astro
npm run dev:api
npm run dev:proxy
```

The local Node API shim does not emulate D1. Without a real `BLOG_DB` binding, publishing, post listing, D1 images, delete operations, and comment settings must be tested through Cloudflare Pages Functions or a Wrangler environment.

## Environment

Copy local placeholders:

```sh
cp .dev.vars.example .dev.vars
```

`.dev.vars` is ignored by Git.

Required for private admin login:

```text
ADMIN_PASSWORD=...
```

Required Cloudflare binding:

```text
BLOG_DB      D1 database for posts, comments, settings, and uploaded small images
```

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

Expected public route shape:

- `/`
- `/blog`
- `/blog/live?slug=...`
- `/collections`
- `/collections/:slug`
- `/search`
- `/about`
- `/changelog`
- `/s1oop`
- `/s1oop/admin`

There are no generated static article routes such as `/blog/my-post`, and no static post indexes such as `/posts.json` or `/search-index.json`.

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

Create the D1 database:

```sh
npx wrangler d1 create s1oop-blog-content
```

Apply the schema:

```sh
npx wrangler d1 execute s1oop-blog-content --file migrations/0001_runtime_posts.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0002_blog_assets.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0003_site_settings.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0004_runtime_post_search_text.sql
npx wrangler d1 execute s1oop-blog-content --file migrations/0005_blog_comments.sql
```

Bind it to the Pages project:

```text
BLOG_DB -> s1oop-blog-content
```

`POST /api/admin/posts` accepts a Markdown file plus optional image files. The Markdown is parsed into HTML and stored in `blog_posts`; uploaded images are stored in `blog_assets` and referenced through `/api/assets/*`.

## Public API

- `GET /api/posts`: returns D1 posts for archive, collections, search, home entry, and recommendations.
- `GET /api/posts/:slug`: returns one published D1 post for `/blog/live?slug=...`.
- `GET /api/assets/*`: serves uploaded D1 image assets.
- `GET /api/comments`: returns public comments when enabled.
- `POST /api/comments`: stores a public comment when comments are enabled.

## Admin API

- `POST /api/admin/check`: verifies the private `/s1oop` password.
- `GET /api/admin/posts`: lists D1 posts.
- `POST /api/admin/posts`: uploads or replaces a D1 post.
- `GET /api/admin/posts/:slug`: checks or fetches one D1 post.
- `DELETE /api/admin/posts/:slug`: deletes one D1 post and its assets.
- `GET /api/admin/assets/orphans`: counts orphaned D1 image assets.
- `DELETE /api/admin/assets/orphans`: deletes orphaned D1 image assets.
- `GET /api/admin/comments`: lists comments for moderation.
- `DELETE /api/admin/comments/:id`: deletes one comment.
- `GET /api/admin/settings`: reads runtime settings.
- `PATCH /api/admin/settings`: updates runtime settings.

## Notes

- Keep article content in D1, not under `content/posts`.
- Use the admin page for new public posts.
- The admin publishing API requires `ADMIN_PASSWORD` and `BLOG_DB` and should only be enabled for trusted deployments.
- Public comments are disabled by default.
- Use Cloudflare Web Analytics for production analytics.

## License

Code is released under the MIT License.

Article content and images remain copyright of their respective author unless a post or asset states otherwise.
