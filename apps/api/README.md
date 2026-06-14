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

Every request except `/health` requires the configured `X-Tenant-ID` and a
Bearer token. The token is a prototype single-tenant control; replace it with
OIDC/JWT verification before any shared or production deployment.

## Intentional Prototype Boundaries

- The local deterministic SOP generator is an adapter placeholder for approved
  external-AI calls.
- Slow work currently runs synchronously; its service boundary is ready to move
  behind Redis/RQ without changing route contracts.
- Authentication, production migrations, and object storage integration are
  required before production use.
