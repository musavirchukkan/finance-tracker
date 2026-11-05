# Security checklist for new features

Use this on every feature branch / PR. Details and history: [AUDIT-CHECKLIST.md](./AUDIT-CHECKLIST.md).

## Before merge

- [ ] No new `"use server"` export takes a client `userId` — mutations use `requireUser()` only
- [ ] Queries that need `userId` are in `*-data.ts` (or non-action server modules)
- [ ] All writes scoped with `user.id` in the `WHERE` (and owned FKs before side effects)
- [ ] New FormData / API input validated (Zod preferred)
- [ ] Errors shown to users go through `UserFacingError` / `clientErrorMessage` — no SQL/driver leaks
- [ ] New list/export endpoints are **bounded** (page, cursor, or hard cap)
- [ ] Reads stay pure (no migrate / EMI / heavy writes inside list helpers)
- [ ] New env keys added to `EnvKeys` + `.env.example` + `getEnv()` validation
- [ ] No secrets in `NEXT_PUBLIC_*` or client bundles
- [ ] Auth-like endpoints rate-limited; sensitive string compares use `secureStringEqual`
- [ ] PWA: no caching of APIs; user pages still session-safe
- [ ] Proxy / headers not weakened
- [ ] `npm run lint && npm run typecheck && npm test` pass

## Module map (keep this split)

| Kind | Where | Example |
|------|--------|---------|
| Server Action (mutation) | `*-actions.ts` with `"use server"` | `createInvestment(formData)` |
| Query / internal service | `*-data.ts` (no `"use server"`) | `listInvestments(userId)`, `insertTransactionForUser` |
| Pure domain | `lib/*.ts` without DB session | `money.ts`, `debt-kinds.ts` |
| Env | `lib/env.ts`, `lib/constants.ts` | `getEnv()`, page sizes, rate limits |

## If you invent a new pattern

Document it here or in the audit checklist in the **same change**, so the next feature inherits it.
