# Ledger — Personal Finance Tracker

Budget vs actual, transactions, and debt payoff — features from your Numbers sheets, as a web app.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind
- **Auth.js** (email/password, portable to VPS)
- **Postgres** via Neon (or local Docker / any Postgres)
- **Drizzle ORM** + **Recharts**
- Deploy: **Vercel** + your **Cloudflare** domain

## Features

- Budget vs actual (expense categories)
- **Income + expenses** with cashflow stats and charts
- Debt account tracker
- **Mobile-first** UI + bottom nav + quick-add FAB
- **PWA** — install to home screen; shortcuts for Quick add
- **Offline queue** — add transactions without internet; auto-sync when back online

## Pages

| Route | Purpose |
|-------|---------|
| `/login` | Sign in |
| `/budget` | Income/spend cashflow + budget charts |
| `/transactions` | Add income/expense (offline-capable) |
| `/quick-add` | Minimal fast entry (PWA shortcut) |
| `/debt` | Debt accounts + payoff curve |
| `/settings` | Categories (income/expense) + install tips |

## Local setup

### 1. Env

```bash
cp .env.example .env.local
```

Set:

- `AUTH_SECRET` — `openssl rand -base64 32`
- `DATABASE_URL` — Neon **pooled** URL (app runtime) **or** local Docker
- `DATABASE_MIGRATION_URL` — Neon **direct** URL (drizzle migrate / seeds). For Docker, same as `DATABASE_URL`
- Optional `SEED_EMAIL` / `SEED_PASSWORD` / `SEED_NAME` for the first user

### 2. Database

**Option A — Neon (recommended for deploy)**  
Create a project at [neon.tech](https://neon.tech). In Connection details copy:

1. **Pooled** → `DATABASE_URL` (host often has `-pooler`)
2. **Direct** → `DATABASE_MIGRATION_URL` (no `-pooler`)

**Option B — Local Docker**

```bash
npm run db:up
# Both URLs can be:
# postgresql://finance:finance@localhost:5432/finance
```

### 3. Schema + seed user

```bash
npm run db:migrate
npm run db:seed
```

Schema changes: edit `src/lib/db/schema.ts` → `npm run db:generate` → commit the new files under `drizzle/` → deploy (build runs migrate).

`db:seed` creates the login user (if missing) and default categories.

`db:push` is emergency local-only — prefer migrations for anything shared.

### 4. Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the seeded email/password.

## Deploy (Vercel + Cloudflare)

### Env vars to set in Vercel

| Key | Required? | What to put |
|-----|-----------|-------------|
| `AUTH_SECRET` | Yes | Output of `openssl rand -base64 32` |
| `DATABASE_URL` | Yes | Neon **pooled** URL (`-pooler` in host) |
| `DATABASE_MIGRATION_URL` | Yes (for auto schema on deploy) | Neon **direct** URL (no `-pooler`) |
| `AUTH_URL` | After first deploy | `https://your-app.vercel.app` (or custom domain) |
| `SEED_*` | No | Not needed on Vercel — seed once from your laptop |

### Auto schema on deploy

`npm run build` runs `npm run db:migrate` first (committed SQL in `drizzle/`, via `DATABASE_MIGRATION_URL`), then builds Next.js.  
**Seeding is not automatic** — after the first deploy, from your machine with Neon URLs in `.env`:

```bash
npm run db:seed
```

## Fresh DB cutover (dump → migrate → import)

Use this when resetting schema history while keeping live data. Dumps stay in `backups/` (gitignored).

### 1. Dump current Neon (or any source)

Needs Docker (uses `postgres:18-alpine` — Neon is PG 18). No local `pg_dump` required.

```bash
node --env-file=.env.prod scripts/dump-db.mjs
# → backups/neon-<stamp>.dump + backups/neon-<stamp>-counts.json
```

### 2. Local dry-run

```bash
npm run db:up

# Restore dump into a separate legacy DB (keeps raw columns)
docker compose exec -T db psql -U finance -d postgres -c "CREATE DATABASE finance_legacy;"
docker run --rm --network finance-tracker_default \
  -e PGPASSWORD=finance \
  -v "$(pwd)/backups:/backups" \
  postgres:18-alpine \
  pg_restore -h db -U finance -d finance_legacy --no-owner --no-acl \
  /backups/$(basename $(cut -d= -f2 backups/.latest-dump))

# Empty target already has DB "finance" — apply clean migrations
DATABASE_URL=postgresql://finance:finance@localhost:5432/finance \
DATABASE_MIGRATION_URL=postgresql://finance:finance@localhost:5432/finance \
  npm run db:migrate

# Map + copy (same UUIDs)
SOURCE_DATABASE_URL=postgresql://finance:finance@localhost:5432/finance_legacy \
TARGET_DATABASE_URL=postgresql://finance:finance@localhost:5432/finance \
  npm run db:import-legacy
```

Point local `.env` at `postgresql://finance:finance@localhost:5432/finance`, run `npm run dev`, verify login + counts.

### 3. Neon branch, then prod

Repeat migrate + import against a Neon branch URL. After spot-checks, point Vercel `DATABASE_URL` / `DATABASE_MIGRATION_URL` at the new DB (or promote the branch).

### Steps

1. Push repo to GitHub.
2. Import project in [Vercel](https://vercel.com) — set env vars above (Production + Preview).
3. Deploy.
4. Vercel → Domains → add `finance.yourdomain.com` (optional).
5. Cloudflare DNS: `CNAME` → `cname.vercel-dns.com` (grey cloud / DNS only for SSL).
6. Set `AUTH_URL` to the live URL → Redeploy.
7. Run `npm run db:seed` once against Neon (creates your login user).

## Later: VPS

Same Next.js app + Auth.js. Point `DATABASE_URL` at Postgres on the VPS (or keep Neon). Update Cloudflare A/CNAME to the VPS. No auth rewrite.
