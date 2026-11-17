# Nighty Repository Instructions

## Authority

- Approved product requirements in `docs/approved/` are the source of truth.
- `orchestration/planning/` defines the controller/developer workflow and safety boundaries.
- Preserve the approved interactive prototype separately; do not import its mock security or persistence behavior as production code.
- Do not change product requirements or architecture silently. Record implementation rulings in the active execution ledger.

## Product invariants

- Product name: **Nighty**; subtitle: **Shift Operations Handover**.
- Responsive browser application for one team in version 1.
- React + TypeScript + Tiptap frontend; NestJS + TypeScript backend; PostgreSQL through Prisma.
- Secure opaque server sessions in HTTP-only cookies, CSRF defense, and 30-minute inactivity expiry.
- Shifts may overlap; their combined active schedule must cover 24 hours without gaps.
- Manual Handover selects the only writable shift instance within an operational day. A new operational day opens automatically once the configured time zone passes the first shift's start (owner ruling, 17 November 2026: `docs/approved/OWNER_RULINGS_2026-11-17.md`); `DAY_ROLLOVER=manual` restores Handover-only behavior.
- Entries save automatically while they are typed; the composer has no Submit button.
- Supported entry actions are Update, To-do list, and Follow only.
- Follow transfers exactly once during Handover.
- Use modern sans-serif typography everywhere; serif fonts are prohibited.

## Development

- Work test-first and verify every completion claim with fresh command output.
- One orchestration/application task is active at a time.
- Never commit credentials, agent logs, SQLite runtime state, attachments, databases, build output, or dependencies.
- Do not push, merge, deploy, schedule background work, or access banking production systems automatically.
- DeepSeek may not be silently replaced as the developer provider.
