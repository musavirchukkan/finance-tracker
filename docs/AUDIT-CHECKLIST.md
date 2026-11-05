# Ledger — audit checklist

Track architecture, performance, and security fixes from the Nov 2026 review.  
Mark items `[x]` when done. Add a short note (PR / commit / date) under an item if useful.

**How to use:** pick severity order (Critical → High → Medium → Low). One item (or related group) per change when possible.

---

## Critical

- [ ] **C1 — Server Action IDOR surface**  
  `"use server"` files export helpers that take client-supplied `userId` (`listTransactions`, `getBudgetSummary`, `insertTransactionForUser`, `getDebtDashboard`, `listCreditCards`, `listBankAccounts`, `listInvestments`, `getNetWorth`, …).  
  **Fix:** Split queries into plain server modules (no `"use server"`), **or** every exported action calls `requireUser()` and ignores client `userId`.  
  **Files:** `src/lib/actions.ts`, `bank-actions.ts`, `card-actions.ts`, `investment-actions.ts`

- [ ] **C2 — Cross-user writes via same surface**  
  Same as C1 for mutators / side-effect helpers callable with arbitrary `userId` (`insertTransactionForUser`, `migrateRollingCreditCards`, EMI posting helpers).  
  **Fix:** Authz inside the action; never trust `userId` from the client.

---

## High

- [x] **H1 — Rate-limit Auth.js credential path**  
  Limiter only wraps `loginAction` / `registerAction`; `POST /api/auth/callback/credentials` → `authorize()` is unbounded.  
  **Fix:** Rate-limit inside `authorize()` (IP + email) or shared wrapper; same generic error.  
  **Files:** `src/lib/auth.ts`, `src/lib/login-action.ts`, `src/lib/rate-limit.ts`  
  **Done (2026-11-05):** `authorize()` rate-limits via `auth-callback:<ip>` (separate from `loginAction` UX bucket). Returns `null` → generic CredentialsSignin. Email-keyed limit still optional follow-up.

- [x] **H2 — Distributed rate limits**  
  In-memory `Map` fails on multi-instance / serverless.  
  **Fix:** Redis / Upstash (or edge WAF) for login, signup, and Auth.js.  
  **Files:** `src/lib/rate-limit.ts`  
  **Done (2026-11-05):** `@upstash/redis` via `REDIS_REST_*` (HTTPS); Lua fixed-window in one round-trip; in-memory fallback when unset. Keepalive → `/api/cron/keepalive?target=redis|neon|both` + `CRON_SECRET`.

- [ ] **H3 — Overview query amplification**  
  Page loads cards + debt, then `getNetWorth` loads them again (migrate/EMI may run twice).  
  **Fix:** Single overview loader; `getNetWorth` accepts preloaded banks/cards/debt or shares one fetch.  
  **Files:** `src/app/(app)/overview/page.tsx`, `src/lib/investment-actions.ts`

- [ ] **H4 — Writes on read paths**  
  `listCreditCards` / `getDebtDashboard` trigger migration + EMI posting.  
  **Fix:** Move to explicit action / cron / first-login job; keep reads pure.  
  **Files:** `src/lib/card-actions.ts`, `src/lib/actions.ts`, `src/lib/emi-statement-post.ts`

- [ ] **H5 — Unbounded data loads**  
  Export all transactions; card activities full table; debt payments full table; unpaginated `listTransactions`.  
  **Fix:** Caps, cursors, streaming, or required date ranges.  
  **Files:** export route, `card-actions.ts`, debt dashboard, `listTransactions`

- [ ] **H6 — Signup open by default**  
  `allowPublicSignup` defaults `true`; invite optional.  
  **Fix:** Default `false` in production (or require invite); document in `.env.example`.  
  **Files:** `src/lib/env.ts`, `.env.example`

---

## Medium

- [ ] **M1 — PWA page cache not user-scoped**  
  Cached HTML keyed by URL; cookie presence ≠ valid session; `/wealth` cached. Shared browser / offline leak.  
  **Fix:** Purge `PAGE_CACHE` on login; user-scoped keys; revalidate when online.  
  **Files:** `public/sw.js`, login success path, `client-cache.ts`

- [ ] **M2 — FormData mutations lack Zod**  
  Auth/API use Zod; most FormData actions use ad-hoc parsing.  
  **Fix:** Zod schemas per action (or shared parsers).  
  **Files:** `actions.ts`, `card-actions.ts`, `bank-actions.ts`, `investment-actions.ts`

- [ ] **M3 — Client error disclosure**  
  `ActionForm` surfaces raw `Error.message`.  
  **Fix:** Map to safe user messages; log details server-side only.  
  **Files:** `src/components/action-form.tsx`

- [ ] **M4 — Proxy auth bypass for paths containing `.`**  
  `pathname.includes(".")` skips auth.  
  **Fix:** Allowlist real static extensions only.  
  **Files:** `src/proxy.ts`

- [ ] **M5 — God modules / layering**  
  Fat `"use server"` barrels mix RSC queries, mutations, and domain orchestration.  
  **Fix:** Split queries / mutations / domain (pairs with C1).  
  **Files:** `actions.ts`, `card-actions.ts`

- [ ] **M6 — Invite code timing-unsafe compare**  
  Plain `!==` on invite code.  
  **Fix:** `crypto.timingSafeEqual` on equal-length buffers.  
  **Files:** `src/lib/register-action.ts`

- [ ] **M7 — Security headers**  
  No CSP / frame-ancestors / HSTS / etc. in Next config.  
  **Fix:** Add headers in `next.config.ts` (or hosting).  
  **Files:** `next.config.ts`

---

## Low / hygiene

- [ ] **L1 — next-auth beta**  
  Track advisories / plan stable Auth.js upgrade.  
  **Files:** `package.json`

- [ ] **L2 — drizzle-kit in `dependencies`**  
  Move to `devDependencies` if not needed at runtime.  
  **Files:** `package.json`

- [ ] **L3 — Email verification**  
  Invite / signup gate is temporary; add verify-before-activate when email provider exists.

- [ ] **L4 — Seed default password**  
  Ensure seed creds never used in production; document.  
  **Files:** `src/lib/env.ts`, seed script

---

## Already in good shape (no action required unless regressing)

These were reviewed as solid — keep them when refactoring:

- [x] Mutation ownership: `requireUser()` + `eq(...userId)` on most FormData actions  
- [x] `assertOwnedTransactionInputs` before transaction ledger side effects  
- [x] JWT DB fingerprint + periodic user recheck (`auth.ts` / `session.ts`)  
- [x] Generic login/signup errors (anti-enumeration messaging)  
- [x] Callback URL allowlists (`proxy.ts`, `login-utils.ts`)  
- [x] Central `env.ts` + production `AUTH_SECRET`  
- [x] Perf indexes (`drizzle/0002_perf_indexes.sql`)  
- [x] Day-level cashflow aggregates + tx pagination/cursor  
- [x] Request-scoped session `React.cache`  
- [x] Parameterized Drizzle (no string-concat SQL)  
- [x] SW skips `/api/`; logout clears caches  

---

## Suggested fix order

1. C1 + C2 (+ M5) — Server Action boundary / module split  
2. ~~H1 (+ H2 when multi-instance) — Auth rate limits~~ **done**  
3. H3 + H4 — Overview loader + pure reads  
4. H5 — Bound large queries / export  
5. H6 — Signup defaults for production  
6. M1 — PWA cache scoping  
7. M2, M3, M4, M6, M7 — validation, errors, proxy, invite, headers  
8. L1–L4 — hygiene  

---

## Progress log

| Date | Item | Notes |
|------|------|--------|
| 2026-11-05 | H1 + H2 | Redis REST (`REDIS_REST_*` + `@upstash/redis` wrapper); distributed auth rate limits; `authorize()` limited; keepalive `?target=` + `CRON_SECRET` |

---

*Source: full-project architecture / performance / security review (Nov 2026).*
