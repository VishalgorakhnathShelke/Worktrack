# WorkTrace AI

WorkTrace AI turns consented browser-workflow recordings into reviewable SOPs,
interactive onboarding guides, feedback signals, and conservative workforce
analytics.

This repository implements the ten-week UNSW project as a scalable monorepo:

- `apps/api`: FastAPI application and domain services
- `apps/web`: React operator, onboarding, and analytics application
- `apps/extension`: Chrome Manifest V3 workflow recorder
- `packages/contracts`: shared JSON Schema contracts
- `docs`: architecture, delivery, security, and per-commit engineering notes

## Product Principles

1. Raw recordings remain in the company's isolated deployment.
2. Typed values require explicit consent; sensitive fields are never captured.
3. Screenshots, audio, and unapproved raw recordings never reach external AI.
4. Every AI-produced SOP requires human approval before publication.
5. Analytics show observed differences and never infer a "best performer."

## Current Milestone

Milestone 2 adds the tenant-scoped API, privacy enforcement, SOP generation,
feedback classification, conservative analytics, and hard-delete cascade. See
[`docs/commits/002-backend-core.md`](docs/commits/002-backend-core.md).

## API Quick Start

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -e "apps/api[dev]"
.\.venv\Scripts\pytest apps/api
.\.venv\Scripts\uvicorn worktrace_api.main:app --app-dir apps/api/src --reload
```

Swagger UI runs at `http://localhost:8000/docs`; the generated API specification
is checked in at [`apps/api/openapi.json`](apps/api/openapi.json).

## Development Workflow

All work lands through small, reviewable commits. Every milestone must:

1. Update this README with the current system state.
2. Add a record under `docs/commits/`.
3. Run the relevant automated tests.
4. Include a senior engineering review covering security, scalability,
   reliability, and efficiency.

Detailed commands will be added as each executable application lands.
