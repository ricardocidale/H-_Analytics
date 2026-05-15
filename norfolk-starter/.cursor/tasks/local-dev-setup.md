# Local Development Setup

## Prerequisites

- Node.js >=20 (check `.nvmrc`)
- Docker Desktop (for local Postgres)
- Git

## First-Time Setup

```bash
cp .env.example .env
# Edit .env with your Clerk and database keys
docker compose up -d
npm install
npx prisma migrate dev
npm run dev
```

Open http://localhost:3000

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server with Turbopack |
| `npm run build` | Production build |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run test` | Run Vitest tests |
| `npm run lint` | ESLint |

## Troubleshooting

- **Prisma client errors:** Run `npm run db:generate`
- **Port 5432 in use:** Stop other Postgres instances, then `docker compose up -d`
- **Port 3000 in use:** `npm run dev -- --port 3001`
