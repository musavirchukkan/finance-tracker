# Ledger — Personal Finance Tracker

Budget vs actual, transactions, and debt payoff — features from your Numbers sheets, as a web app.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind
- **Auth.js** (email/password, portable to VPS)
- **Postgres** via Neon (or local Docker / any Postgres)
- **Drizzle ORM** + **Recharts**
- Deploy: **Vercel** + your **Cloudflare** domain

## Pages

| Route | Purpose |
|-------|---------|
| `/login` | Sign in |
| `/budget` | Monthly budget, donut + bar charts, category summary |
| `/transactions` | Log expenses (feeds Actual on Budget) |
| `/debt` | Debt accounts, payment log, payoff curve |
| `/settings` | Categories + debt goal date |

## Local setup

### 1. Env

```bash
cp .env.example .env.local
```

Set:

- `AUTH_SECRET` — `openssl rand -base64 32`
- `DATABASE_URL` — Neon connection string **or** local Docker below
- Optional `SEED_EMAIL` / `SEED_PASSWORD` / `SEED_NAME` for the first user

### 2. Database

**Option A — Neon (recommended for deploy)**  
Create a free project at [neon.tech](https://neon.tech), copy the connection string into `DATABASE_URL`.

**Option B — Local Docker**

```bash
npm run db:up
# DATABASE_URL=postgresql://finance:finance@localhost:5432/finance
```

### 3. Schema + seed user

```bash
npm run db:push
npm run db:seed
```

### 4. Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the seeded email/password.

## Deploy (Vercel + Cloudflare)

1. Push repo to GitHub.
2. Import project in [Vercel](https://vercel.com) — set env vars `AUTH_SECRET`, `DATABASE_URL` (Neon).
3. Deploy.
4. Vercel → Domains → add `finance.yourdomain.com`.
5. Cloudflare DNS: `CNAME` → `cname.vercel-dns.com` (grey cloud / DNS only for SSL).
6. Run `db:push` and `db:seed` once against the Neon DB (from your machine with production `DATABASE_URL`).

## Later: VPS

Same Next.js app + Auth.js. Point `DATABASE_URL` at Postgres on the VPS (or keep Neon). Update Cloudflare A/CNAME to the VPS. No auth rewrite.
