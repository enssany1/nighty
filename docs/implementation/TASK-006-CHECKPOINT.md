# TASK-006 overlapping shift schedules checkpoint

**Implementer/reviewer:** Codex, acting directly under the owner's unattended implementation authorization
**Status:** Accepted for local checkpoint
**Baseline:** b13208a

## Outcome

Nighty now validates full circular 24-hour coverage while allowing any overlap, supports administrator shift create/update/reorder workflows, and materializes immutable operational-day definition and assignment snapshots.

This is a direct Codex checkpoint, not a DeepSeek-authored runner delivery and not an independent-agent review.

## Test-first evidence

- RED: coverage tests could not load the absent owner and schedule endpoints returned 404.
- GREEN: four focused minute-union tests and three PostgreSQL end-to-end schedule/materialization tests pass.

## Verification

- Additive migration `20261114221500_shift_instance_assignments` deployed successfully.
- `npm test -w @nighty/api -- shift-coverage` -> exit 0, 4 passed.
- `npm run test:e2e -w @nighty/api -- shifts.e2e-spec.ts` -> exit 0, 3 passed.
- Full repository contract generation, integration, verification, build, and production dependency audit are recorded immediately before the checkpoint commit.

## Review findings

1. Coverage is a union of active minutes 0..1439; overlaps do not subtract or invalidate coverage.
2. Overnight intervals wrap correctly and exact uncovered ranges are returned.
3. Active zero-duration and case-insensitive duplicate names fail before persistence.
4. Reordering uses temporary collision-free positions inside one serializable transaction.
5. The first ordered active definition owns the operational-day boundary minute.
6. Materialization copies definition and user-assignment facts once; subsequent definition edits return the original snapshots.

## Limitations

Newly materialized future days begin with all shifts Upcoming. Manual shift activation and handover state transitions are owned by TASK-008; the seeded present day retains its active shift.
