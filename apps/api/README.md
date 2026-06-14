# WorkTrace API

The API owns tenant-scoped persistence, privacy filtering, SOP generation,
feedback classification, approved walkthrough publication, export bundles, and
conservative analytics.

## Local Development

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -e "apps/api[dev]"
.\.venv\Scripts\pytest apps/api
.\.venv\Scripts\uvicorn worktrace_api.main:app --app-dir apps/api/src --reload
```

Swagger UI is available at `http://localhost:8000/docs`. The checked-in
[`openapi.json`](openapi.json) can be regenerated with:

```powershell
.\.venv\Scripts\python apps/api/scripts/export_openapi.py
```

Every request except `/health` requires the configured `X-Tenant-ID` and a
Bearer token. The token is a prototype single-tenant control; replace it with
OIDC/JWT verification before any shared or production deployment.

## Endpoint Groups

- `/recordings`: create recording drafts, upload idempotent chunks, complete
  ingestion, and poll read-only processing status.
- `/sessions`: ingest, list, inspect, delete, preview AI payloads, approve AI
  payloads, and generate SOPs.
- `/sops`: inspect and approve SOP versions.
- `/walkthroughs`: retrieve approved SOPs for onboarding.
- `/feedback`: classify and store workflow feedback.
- `/analytics`: compare observed paths and friction evidence.
- `/exports`: export one sanitized session with its SOPs and feedback.

## Intentional Prototype Boundaries

- Recording chunks use tenant-scoped local object storage. Replace the storage
  adapter with MinIO/S3 and enqueue workers after completion for multi-instance
  deployment.
- Status polling reports worker-owned state; GET requests never advance the
  pipeline. The processing workers themselves are a later milestone.
- The local deterministic SOP generator is an adapter placeholder for approved
  external-AI calls.
- Slow work currently runs synchronously; its service boundary is ready to move
  behind Redis/RQ without changing route contracts.
- Authentication and production migrations are required before production use.
