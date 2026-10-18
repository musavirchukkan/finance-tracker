# Future plan: Credit card EMI & billing

Deferred ideas and follow-ups. **Not in scope for the current bill-date EMI posting work.**

## Shipped (current)

- On statement / bill date: post linked CC EMI (principal + interest + GST) onto card outstanding; unlock principal from limit; debt schedule advances.
- Due / overdue only after the bank bill is included (statement amount or pin).
- Mid-cycle card add: no auto-post (card created after bill day). On the CC EMI debt form, choose:
  - **Already in outstanding** — unlock principal only (no double-count)
  - **Add EMI now** — post onto outstanding + unlock
  - **Wait for bill day** — leave for auto-post next cycle
- Warnings when bill/EMI unpaid or due date is 2+ days past.

## Deferred

### 1. Pay bill + EMI cash in one step
When logging **Pay bill**, optionally mark that cycle’s linked EMI cash as settled (or allocate payment across statement + EMI) so bank outflow is a single action. Previously chosen as “keep separate for now”.

### 2. Scheduled / cron posting
Post EMIs via a daily job instead of lazy post on Cards/Debt page load (better if the app is not opened on bill day).

### 3. Backfill prior statement cycles
Only the **latest** closed bill cycle is auto-posted. A tool to post or rebuild missed historical cycles.

### 4. Partial bill payments vs EMI unlock
Rules for minimum due / partial pay: how much principal unlocks, how leftovers stay on statement.

### 5. Shared-limit EMI posting UX
Clearer copy when one EMI posts on MyZone but available updates on IndianOil / Neo too.

### 6. Statement import
Import Axis (or other) statement CSV/PDF to fill P / I / GST and reconcile remaining principal.

### 7. Notify outside the app
Email / push / WhatsApp when bill is due in 3 days or overdue by 2+ days.

### 8. Drizzle migrations (ops)
Move off `drizzle-kit push` to versioned migrations + `__drizzle_migrations`; remove one-shot due-gap backfill after all envs migrated.

### 9. Fresh schema + dump/import
Clean DB rebuild with local dump + `import-legacy-data` (already sketched); cut over after verification on a Neon branch.

### 10. EMI holiday / skip month
Support bank “skip EMI” without unlocking principal or posting to outstanding.

### 11. Pre-due nudges
Warn 3 days *before* the due date (not only on/after due), with a quieter severity than overdue.

### 12. Undo / reverse EMI post
If a statement was posted on the wrong cycle, reverse the debt payment + card activity + outstanding in one action.

### 13. Multi-EMI ordering on shared limit
When several EMIs post on the same bill date, show a clear breakdown on the statement activity list (already one row each; richer group summary optional).
