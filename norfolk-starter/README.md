# Norfolk Starter

A practical starter repo for Norfolk AI web projects.

This repo is meant to do two jobs:

- give you a clean full-stack application starting point
- give you a Norfolk AI operating layer for Claude Code and similar tools

## What is in this repo

This starter includes:

- Next.js + React + TypeScript
- Tailwind + shadcn/ui
- Prisma + PostgreSQL
- Clerk auth
- Norfolk project rules in `CLAUDE.md`
- Norfolk AI wrapper skills with the `nai-` prefix for Claude Code

## Who this is for

Use this repo if you want:

- a clean app starter
- a repeatable Claude Code setup
- Norfolk AI wrapper commands that are easier to remember than raw tool combinations

## The Norfolk AI idea

The `nai-` commands are wrappers.

That means you run one command, and the wrapper decides the working style for you.

In plain English:

- use structured execution for clear, disciplined work
- use broader orchestration only when the task is messy or ambiguous
- keep work cost-aware by default

You should not have to remember when to use every plugin yourself.

## Main Norfolk commands

- `nai-help` — explains the Norfolk commands in plain English
- `nai-update` — checks whether your Claude setup looks healthy
- `nai-plan` — planning and decomposition
- `nai-feature` — default command for feature work
- `nai-frontend` — UI and design-to-code work
- `nai-review` — review, cleanup, and quality passes
- `nai-architecture` — architecture and structural choices
- `nai-agent-native-audit` — checks whether the codebase is easy for agents to work in
- `nai-agent-native-architecture` — shapes systems to be easier for agents to modify safely
- `nai-finance` — finance, assumptions, scenarios, and modeling
- `nai-debug` — debugging and fault isolation
- `nai-research` — docs lookup and fact-finding before action

## Fast start

### 1. Clone the repo

```bash
git clone https://github.com/Norfolk-Group/norfolk-starter.git my-new-project
cd my-new-project
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set environment variables

```bash
cp .env.example .env
```

Then fill in your real values.

### 4. Start local database

```bash
docker compose up -d
```

### 5. Run Prisma

```bash
npx prisma migrate dev
```

### 6. Start the app

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Claude Code setup

The repo includes Norfolk AI starter files for Claude Code.

Start here:

- Windows: `docs/setup-claude-code-windows.md`
- Mac: `docs/setup-claude-code-mac.md`
- Replit: `docs/setup-claude-code-replit.md`

The Claude Code files live here:

- `claude-code/settings.template.json`
- `claude-code/skills/`
- `scripts/check-norfolk-setup.ps1`
- `scripts/check-norfolk-setup.sh`

These files are templates for your local Claude Code setup.

## Project structure

```text
app/
components/
lib/
prisma/
public/
claude-code/
  settings.template.json
  skills/
docs/
scripts/
CLAUDE.md
README.md
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start local dev server |
| `npm run build` | Production build |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:seed` | Seed database |
| `npm run test` | Run tests |
| `npm run lint` | Run ESLint |
| `pwsh .\scripts\check-norfolk-setup.ps1` | Check Norfolk Claude setup on Windows |
| `bash ./scripts/check-norfolk-setup.sh` | Check Norfolk Claude setup on Mac/Linux/Replit |

## How to think about model cost

The intended Norfolk pattern is:

- use stronger reasoning for planning and architecture
- use cheaper execution for routine coding
- keep requests small and scoped
- avoid reprocessing the whole repo over and over

In plain English:

- use the expensive brain to decide
- use the cheaper brain to build

## If you are new to this repo

Do this first:

1. get the app running
2. read `CLAUDE.md`
3. install the Claude Code files from `claude-code/`
4. run `nai-help`
5. use `nai-feature` for real work

## Current status

This repo is being turned into the main Norfolk starter repo for:

- app scaffolding
- Cursor support
- Claude Code support
- Norfolk AI wrapper skills

That means the repo is both a software starter and an operating system for AI-assisted work.

## When something breaks

**App won't start**
- Check `.env` has all required values from `.env.example`
- Verify `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set

**Database errors**
- Confirm Docker is running: `docker compose ps`
- Run pending migrations: `npx prisma migrate dev`
- Check `DATABASE_URL` in `.env` points to the running database

**Claude Code issues**
- Mac/Linux: `bash ./scripts/check-norfolk-setup.sh`
- Windows: `pwsh .\scripts\check-norfolk-setup.ps1`

**Build errors**
- Check `CLAUDE.md` for repo-specific constraints
- Run `npm run lint` to catch obvious issues before building

**Auth issues**
- Verify Clerk keys in `.env` match your Clerk dashboard at clerk.com
- Confirm the correct sign-in/sign-up URLs are set in `middleware.ts`
