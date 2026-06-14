# Contributing

## Branches and Reviews

- Branch names: `feature/<area>-<description>` or `fix/<area>-<description>`.
- Every pull request needs one reviewer outside the primary owner.
- Changes to `packages/contracts` require reviews from both an API owner and a
  consuming application owner.
- Do not merge when tests, privacy checks, or schema compatibility checks fail.

## Definition of Done

- Acceptance criteria are demonstrated through tests or a documented manual
  check.
- New external-AI payloads are explicitly allowlisted and privacy tested.
- Database reads and writes remain tenant-scoped.
- Public contracts are backward compatible or include a migration plan.
- Documentation explains operational impact and rollback steps.

## Engineering Defaults

- Prefer small domain services over logic inside route handlers or UI views.
- Keep provider-specific AI code behind adapters.
- Use durable job boundaries for slow AI, transcription, and analytics work.
- Reject unsafe input rather than attempting to silently repair it.
- Include stable identifiers and schema versions in persisted/public objects.
