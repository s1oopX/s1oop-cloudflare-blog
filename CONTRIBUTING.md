# Contributing

Thanks for your interest in improving this project.

## Development

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:4322`.

Before submitting a change:

```sh
npm run build
```

## Scope

Good contributions include:

- Bug fixes.
- Accessibility improvements.
- Small UI refinements that match the existing archive-style design.
- Documentation improvements.
- Cloudflare deployment or local development fixes.

Please keep changes focused. Large visual rewrites or unrelated refactors are easier to review when split into separate changes.

## Secrets

Do not commit `.dev.vars`, tokens, passwords, private keys, or Cloudflare/GitHub credentials.

Use `.dev.vars.example` for placeholders only.
