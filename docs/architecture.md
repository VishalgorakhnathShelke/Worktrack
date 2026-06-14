# Architecture

## Runtime Boundary

Each customer receives an isolated Docker deployment. Raw recordings,
screenshots, audio, SOPs, and feedback remain inside that deployment. A future
central service may receive explicitly approved, non-reversible aggregate
statistics, but central synchronisation is not implemented in this prototype.

```text
Chrome extension
  -> FastAPI ingestion and domain API
  -> PostgreSQL / local object storage
  -> background job boundary
  -> AI, transcription, and analytics adapters
  -> React operator and onboarding application
```

## Scalability Decisions

- Stable UUID identifiers avoid coupling records to one database instance.
- Every object contains `tenant_id` even in single-tenant deployments, keeping
  future shared-service migration possible.
- Public objects contain a `schema_version` for forward migrations.
- Slow work is represented as jobs, allowing Redis/RQ workers to replace the
  prototype in-process executor without changing public APIs.
- AI providers implement a common interface and receive only approved payloads.
- Session events are append-only; derived SOP and analytics outputs are
  versioned rather than overwriting their sources.

## Trust Boundaries

External AI may receive only approved, redacted text. It may never receive:

- screenshots or audio;
- password, payment, authentication, or configured sensitive-field values;
- unapproved typed text;
- complete raw event streams.

## Conservative Analytics

Analytics may compare paths, timings, and reviewer-selected reference sessions.
It must not equate speed with quality or label an employee as a top performer.
Clustering is disabled when fewer than eight comparable sessions exist.
