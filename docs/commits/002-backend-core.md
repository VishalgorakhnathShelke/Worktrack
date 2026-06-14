# Commit 002: Tenant-Scoped Backend Core

## What Changed

- Added FastAPI routes for sessions, SOPs, walkthroughs, feedback, analytics,
  exports, AI payload preview, and cascading deletion.
- Added SQLAlchemy persistence with mandatory tenant filters.
- Added authenticated single-tenant access, consent-aware privacy filtering,
  immutable AI approval records, domain allowlisting, and opaque asset references.
- Added deterministic local adapters and automated API/privacy/service tests.
- Strengthened the shared contracts after an independent engineering review.

## Why

The first executable milestone must prove the product's trust boundary and
end-to-end domain flow before introducing UI complexity or external AI.

## Scalability Review

- Routes delegate to domain services and repositories.
- Provider and persistence boundaries can be replaced independently.
- Session size is bounded; batch ingestion remains a future optimisation.
- Slow work is isolated behind service functions ready for job workers.

## Senior Review

- Security: tenant identity is bound to a configured Bearer token, sensitive
  values and URL credentials are removed before persistence, external payloads
  exclude assets and identifiers, deletion cascades through derived records,
  and production fails closed on default credentials or a missing domain allowlist.
- Quality: public schemas, API models, and tests cover the same invariants.
- Efficiency: analytics are linear over prototype session volumes and refuse
  unsupported clustering below eight sessions.
- Residual risk: OIDC authentication, object storage deletion hooks,
  event-batch ingestion, statistical clustering, and database migrations remain
  required before production use.
