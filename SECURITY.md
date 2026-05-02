# Security Policy

## Reporting

If you find a security issue, do not open a public issue with exploit details.

Report it privately to the repository owner through GitHub or by email if a contact address is provided on the profile.

## Secrets

This project expects secrets to be configured outside Git:

- Local development: `.dev.vars`
- Cloudflare Pages: environment variables
- Cloudflare Workers: secrets or environment variables

Never commit:

- `ADMIN_PASSWORD`
- Cloudflare API tokens
- SSH private keys
- `.dev.vars`

## Admin API

The `/s1oop/admin` publishing API is optional. It should only be enabled in deployments where `ADMIN_PASSWORD` and the `BLOG_DB` D1 binding are configured intentionally.
