# Deploy to Production

## Automatic

Push to `main` → Vercel auto-deploys via `.github/workflows/vercel-deploy.yml`

## Manual

```bash
npx vercel deploy --prod
```

## Pre-Deploy Checklist

- [ ] `npm run build` passes locally
- [ ] No secrets in committed files
- [ ] Prisma migrations committed under `prisma/migrations/`
- [ ] `prisma migrate deploy` run against production DB if schema changed
- [ ] README.md updated if needed

## First-Time Vercel Setup

1. Create a Neon PostgreSQL instance → set `DATABASE_URL` in Vercel
2. Create a Clerk app → set `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
3. Set all other env vars from `.env.example`
4. Add GitHub Actions secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
