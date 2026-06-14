# WorkTrace AI

WorkTrace AI is a prototype for turning a person's consented browser workflow
into useful business documentation.

In simple terms, a user starts the WorkTrace Chrome extension, performs a task
such as approving an invoice, and stops the recording. The extension records
the important browser actions, occasional screenshots, and optional spoken
explanations. The backend safely receives that evidence so it can eventually be
turned into a reviewable Standard Operating Procedure (SOP), onboarding guide,
feedback signal, and workflow analysis.

This repository contains:

- an operable Chrome workflow recorder;
- a secure, tenant-scoped FastAPI backend;
- resumable upload and local storage for recordings;
- APIs for sessions, SOPs, approvals, feedback, exports, and analytics;
- privacy filters, shared data contracts, automated tests, and project
  documentation.

This is a commercially credible **prototype**, not production-certified
software.

## The Problem It Solves

Companies often rely on employees to explain business processes manually.
Important knowledge can remain in people's heads, written instructions become
outdated, and different employees may complete the same task in different ways.

WorkTrace is intended to make that knowledge easier to capture:

1. An employee records themselves completing a browser-based task.
2. WorkTrace collects evidence about what happened.
3. The evidence is processed into a draft SOP.
4. A human reviews and approves the SOP.
5. Approved SOPs can support onboarding and workflow improvement.

## What Works Today

| Area | Current state |
|---|---|
| Chrome recorder popup | Implemented |
| Start, pause, resume, stop, and retry controls | Implemented |
| Explicit screenshot/action consent | Implemented |
| Browser click, navigation, and field-change events | Implemented |
| Low-FPS screenshots | Implemented at one screenshot every two seconds |
| Optional microphone narration | Implemented in ten-second WebM/Opus chunks |
| Offline/resumable upload | Implemented with IndexedDB and retries |
| Secure chunk validation | Implemented with checksums, sizes, and idempotency |
| Recording status API | Implemented |
| Session privacy filtering | Implemented |
| Local deterministic SOP generation from sessions | Implemented |
| SOP approval and approved walkthrough retrieval | Implemented |
| Feedback classification | Implemented using simple rules |
| Basic path and timing analytics | Implemented |
| Swagger/OpenAPI documentation | Implemented |
| Automatic transcription | Not implemented |
| Screenshot understanding/redaction pipeline | Not implemented |
| Automatic conversion of uploaded recording chunks into a session | Not implemented |
| Background processing workers | Not implemented |
| React web application/SOP editor/dashboard | Not implemented |
| Docker Compose, PostgreSQL, MinIO, Redis, RQ, pgvector | Planned, not implemented |
| External GPT/Claude integration | Approval boundary exists; provider call is not implemented |

### Important Current Gap

The two main halves exist, but the bridge between them is not built yet:

- The Chrome extension uploads raw event, screenshot, and audio chunks into a
  `Recording`.
- The backend can generate SOPs and analytics from a structured
  `WorkflowSession`.
- No worker currently reads a completed `Recording`, transcribes its audio,
  analyses screenshots, aligns evidence, creates a `WorkflowSession`, and starts
  SOP generation.

Therefore, a recording successfully reaches the `validating` state and remains
there until the processing-worker milestone is implemented.

## How The Current System Works

```text
User opens the Chrome popup
        |
        v
User reviews consent and starts recording one selected tab
        |
        +--> Browser actions are collected in batches
        +--> Visible-tab screenshots are captured every two seconds
        +--> Optional microphone audio is split every ten seconds
        |
        v
Every piece becomes a numbered "chunk"
        |
        v
Chunk is saved in browser IndexedDB before upload
        |
        +--> Online: upload immediately
        +--> Offline/error: keep locally and retry later
        |
        v
FastAPI verifies tenant, checksum, size, order, and duplicate safety
        |
        v
Raw file is stored under the tenant recording directory
Metadata is stored in the database
        |
        v
User stops recording
        |
        v
Backend confirms every expected chunk arrived
        |
        v
Recording becomes "validating"
        |
        v
Future worker pipeline: transcription -> screenshot processing ->
evidence alignment -> SOP generation -> human review
```

## Key Ideas In Plain English

### Recording

A `Recording` is the raw package created by the extension. It contains numbered
pieces of events, screenshots, and optional audio.

### Chunk

A `Chunk` is one durable piece of a recording. Each chunk has:

- a recording ID;
- a unique sequence number;
- a type: events, screenshots, or audio;
- start and end timestamps;
- its size;
- a SHA-256 checksum proving its contents were not changed;
- an idempotency key allowing safe retries.

### Workflow Session

A `WorkflowSession` is the clean, structured interpretation used by SOP and
analytics features. Today, sessions can be submitted through the session API,
but they are not automatically created from uploaded recordings.

### SOP

An `SOP` is a versioned set of instructions generated from a structured
session. It starts as a draft and must be approved before it is exposed as an
onboarding walkthrough.

### Tenant

A tenant represents one company deployment. All database reads, writes, files,
and API requests are scoped to a tenant ID to reduce the risk of one company
seeing another company's data.

## Privacy And Safety Model

Privacy is part of the architecture rather than an optional final step.

- Recording requires an explicit consent checkbox.
- A visible badge shows when the selected tab is recording or paused.
- Only the explicitly selected, foreground browser tab can produce screenshots.
- Structured browser events never include the value typed into a field.
- Password and common authentication/payment-related fields are treated as
  sensitive.
- Screenshots are suppressed while a sensitive field has focus.
- Consent copy warns that screenshots may still include any visible on-screen
  information.
- Microphone capture is optional and stops when the recording stops.
- Failed microphone control commands force-close the audio document.
- Raw chunks are stored inside the configured tenant environment.
- External AI preview payloads exclude screenshots, audio, URLs, selectors, and
  other raw identifiers.
- External AI payloads require review and approval and are protected by a hash
  so a changed payload must be reviewed again.
- Analytics describe observed paths and friction; they do not rank employees or
  call the fastest person the best performer.

The prototype does **not** currently encrypt files at rest, perform server-side
screenshot redaction, provide production authentication, or enforce a complete
retention/deletion policy.

## Repository Structure

```text
worktrace-ai/
|-- apps/
|   |-- api/                 FastAPI backend, persistence, privacy, and services
|   `-- extension/           Chrome Manifest V3 workflow recorder
|-- packages/
|   `-- contracts/           Shared JSON descriptions of important data objects
|-- docs/                    Architecture, delivery, security, and commit notes
|-- README.md                This complete project guide
|-- CONTRIBUTING.md          Engineering and review rules
|-- CODEOWNERS               Intended primary and secondary owners
|-- package.json             Root JavaScript workspace commands
`-- pnpm-workspace.yaml      JavaScript workspace package locations
```

There is currently no `apps/web` directory even though it remains listed in the
planned workspace. The React web application is future work.

## File Guide

### Root Files

| File | Layman explanation |
|---|---|
| `README.md` | The main explanation and operating guide for the whole project. |
| `.env.example` | Example backend configuration: database, storage, tenant, token, domains, and AI settings. |
| `.gitignore` | Prevents generated files, secrets, databases, builds, and dependencies from being committed. |
| `.editorconfig` | Keeps indentation, line endings, and text formatting consistent. |
| `package.json` | Defines root commands that run JavaScript workspace builds and tests. |
| `pnpm-workspace.yaml` | Tells pnpm which folders belong to the JavaScript monorepo. |
| `CONTRIBUTING.md` | Rules for branches, reviews, privacy, and definition of done. |
| `CODEOWNERS` | Maps project areas to intended primary and backup reviewers. |

### Chrome Extension Files

| File | Layman explanation |
|---|---|
| `apps/extension/manifest.json` | Chrome's instruction sheet: extension name, permissions, popup, background worker, and content script. |
| `apps/extension/package.json` | Extension build, test, and syntax-check commands. |
| `apps/extension/README.md` | Extension-specific setup, use, and limitations. |
| `apps/extension/scripts/build.mjs` | Creates `apps/extension/dist`, the folder loaded into Chrome. |
| `apps/extension/src/popup.html` | Structure of the toolbar popup a user sees. |
| `apps/extension/src/popup.css` | Visual design of the popup. |
| `apps/extension/src/popup.mjs` | Makes popup buttons, counters, settings, status, and error messages work. |
| `apps/extension/src/content.mjs` | Runs inside normal websites, observes approved actions, batches events, requests screenshots, and shows the recording badge. |
| `apps/extension/src/background.mjs` | The extension's coordinator. It connects the popup, selected tab, audio recorder, durable queue, and backend. |
| `apps/extension/src/offscreen.html` | Hidden Chrome page required to keep microphone recording alive. |
| `apps/extension/src/offscreen.mjs` | Uses the microphone and splits narration into ten-second audio chunks. |
| `apps/extension/src/core/chunks.mjs` | Packages evidence into numbered chunks and calculates SHA-256 checksums. |
| `apps/extension/src/core/recorder.mjs` | Controls recording state, chunk order, counters, pause/resume, stop, and completion retry. |
| `apps/extension/src/core/store.mjs` | Saves pending chunks in browser IndexedDB so network loss does not destroy a recording. |
| `apps/extension/src/core/uploader.mjs` | Sends chunks to the backend, retries failures, removes acknowledged chunks, and checks browser storage pressure. |
| `apps/extension/src/core/tab-policy.mjs` | Ensures only the selected active tab can see recording state or produce screenshots. |

### Extension Tests

| File | What it proves |
|---|---|
| `apps/extension/tests/manifest.test.mjs` | The built extension exposes the required popup, content script, and offscreen capability. |
| `apps/extension/tests/recorder.test.mjs` | Chunk numbering, durable state, pause/stop, audio, and retry behavior work correctly. |
| `apps/extension/tests/tab-policy.test.mjs` | Other tabs cannot access recording state or capture screenshots. |
| `apps/extension/tests/uploader.test.mjs` | Chunks survive failures, delete only after acknowledgement, respect storage limits, and retry on completion. |

### Backend Files

| File | Layman explanation |
|---|---|
| `apps/api/pyproject.toml` | Python package information, dependencies, and test/lint configuration. |
| `apps/api/README.md` | Backend-specific setup, endpoint groups, and prototype boundaries. |
| `apps/api/openapi.json` | Generated machine-readable Swagger/API contract. |
| `apps/api/scripts/export_openapi.py` | Regenerates `openapi.json` from the live FastAPI application. |
| `apps/api/src/worktrace_api/__init__.py` | Marks the backend source directory as a Python package. |
| `apps/api/src/worktrace_api/main.py` | Defines the HTTP API, authentication check, endpoint behavior, and Swagger groups. |
| `apps/api/src/worktrace_api/settings.py` | Reads environment settings and rejects unsafe production defaults. |
| `apps/api/src/worktrace_api/schemas.py` | Defines the allowed shape and validation rules for recordings, sessions, SOPs, feedback, and analytics. |
| `apps/api/src/worktrace_api/database.py` | Defines database tables and creates database connections. |
| `apps/api/src/worktrace_api/repository.py` | The database access layer. It performs tenant-scoped saves, reads, approvals, deletes, and conversions. |
| `apps/api/src/worktrace_api/recordings.py` | Validates checksums/sizes and writes raw recording chunks to local storage. |
| `apps/api/src/worktrace_api/privacy.py` | Removes sensitive or unconsented information and builds safe external-AI previews. |
| `apps/api/src/worktrace_api/services.py` | Contains prototype business logic for SOP generation, feedback classification, and analytics. |

### Backend Tests

| File | What it proves |
|---|---|
| `apps/api/tests/conftest.py` | Creates isolated test configuration and database fixtures. |
| `apps/api/tests/test_api.py` | Tests the session-to-SOP-to-approval-to-feedback API flow and authentication rules. |
| `apps/api/tests/test_openapi.py` | Ensures checked-in Swagger matches the application and includes expected endpoint groups. |
| `apps/api/tests/test_privacy.py` | Proves unconsented/sensitive data is removed and external-AI previews are restricted. |
| `apps/api/tests/test_recordings.py` | Tests resumable chunks, checksums, duplicates, missing pieces, and completion. |
| `apps/api/tests/test_services.py` | Tests SOP creation and conservative analytics behavior. |
| `apps/api/tests/test_settings.py` | Proves production configuration rejects insecure development defaults. |

### Shared Contract Files

The JSON Schema files describe shared data objects so different applications
can agree on what fields exist and which values are valid.

| File | Describes |
|---|---|
| `packages/contracts/schemas/session-event.schema.json` | One browser action in a workflow. |
| `packages/contracts/schemas/workflow-session.schema.json` | A complete structured workflow session. |
| `packages/contracts/schemas/recording.schema.json` | The status and upload totals of one raw recording. |
| `packages/contracts/schemas/sop.schema.json` | A versioned SOP and its ordered steps. |
| `packages/contracts/schemas/feedback.schema.json` | Feedback linked to a session or SOP step. |
| `packages/contracts/schemas/analytics-summary.schema.json` | Path, timing, friction, and summary analytics. |
| `packages/contracts/scripts/validate-contracts.mjs` | Checks that every contract has required metadata and valid references. |
| `packages/contracts/package.json` | Exposes contract validation as build/test/typecheck commands. |

### Documentation Files

| File | Purpose |
|---|---|
| `docs/architecture.md` | Intended runtime boundaries, scaling decisions, and privacy rules. |
| `docs/delivery-plan.md` | Ten-week schedule and six-person ownership plan. |
| `docs/security/threat-model.md` | Highest-risk data, required controls, and prototype limitations. |
| `docs/commits/001-foundation.md` | Why the initial repository, contracts, and ownership structure were created. |
| `docs/commits/002-backend-core.md` | Explains the tenant-scoped backend milestone. |
| `docs/commits/003-swagger-api-contract.md` | Explains the generated Swagger contract milestone. |
| `docs/commits/004-resumable-recording-uploads.md` | Explains durable chunk upload and backend recording ingestion. |
| `docs/commits/005-browser-recorder-engine.md` | Explains event capture, screenshots, and recorder coordination. |
| `docs/commits/006-operable-chrome-recorder.md` | Explains the popup, microphone recorder, controls, and final recorder review. |

## Backend API In Plain English

Every endpoint except `/health` requires:

- `X-Tenant-ID`: identifies the company deployment;
- `Authorization: Bearer <token>`: prototype API authentication.

Interactive Swagger documentation runs at `http://localhost:8000/docs`.

### Recording Upload Endpoints

| Method and path | Purpose |
|---|---|
| `POST /recordings` | Opens a new raw recording and returns its ID. |
| `PUT /recordings/{id}/chunks/{index}` | Safely uploads one numbered event, screenshot, or audio chunk. |
| `POST /recordings/{id}/complete` | Confirms every expected chunk arrived and starts the future processing pipeline. |
| `GET /recordings/{id}/status` | Returns upload totals and the current processing state. |

### Structured Session And Product Endpoints

| Method and path | Purpose |
|---|---|
| `POST /sessions` | Stores a structured session after privacy filtering. |
| `GET /sessions` | Lists sessions. |
| `GET /sessions/{id}` | Retrieves one session. |
| `DELETE /sessions/{id}` | Deletes a session and its SOPs, feedback, and AI approvals. |
| `POST /sessions/{id}/ai-preview` | Shows exactly which redacted text could be sent to an external AI provider. |
| `POST /sessions/{id}/ai-approval` | Records approval or rejection of the reviewed AI payload. |
| `POST /sessions/{id}/sops` | Generates a deterministic draft SOP from a structured session. |
| `GET /sops/{id}` | Retrieves an SOP. |
| `POST /sops/{id}/approval` | Approves an SOP or returns it to draft. |
| `GET /walkthroughs/{id}` | Retrieves an approved SOP for onboarding use. |
| `POST /feedback` | Stores and classifies feedback. |
| `GET /analytics/{workflow_name}` | Summarises observed paths and timing friction. |
| `GET /exports/{session_id}` | Exports a session with its SOPs and feedback. |

## Recording Status Stages

The API exposes the intended processing journey:

```text
recording
-> uploading
-> validating
-> transcribing_audio
-> processing_screenshots
-> aligning_evidence
-> generating_sop
-> ready_for_review
-> completed
```

Only `recording`, `uploading`, and `validating` are currently driven by the
recording flow. Later stages require processing workers.

## Technology Used

| Area | Current technology |
|---|---|
| Browser recorder | Chrome Manifest V3, modern JavaScript, IndexedDB, MediaRecorder |
| Backend API | Python 3.12, FastAPI, Pydantic |
| Database layer | SQLAlchemy; SQLite by default |
| Raw file storage | Tenant-scoped local filesystem |
| API documentation | FastAPI Swagger/OpenAPI |
| Backend testing | Pytest |
| Extension testing | Node's built-in test runner |
| Code quality | Ruff and JavaScript syntax checks |
| Shared contracts | JSON Schema |

The planned production-style stack includes PostgreSQL, pgvector, MinIO, Redis,
RQ workers, React, Tailwind, local Whisper, and configurable external AI
providers. Those components are not yet present in this repository.

## Local Setup

### Requirements

- Python 3.12 or newer
- Node.js with modern Web APIs
- Google Chrome 116 or newer
- PowerShell commands below assume Windows

### 1. Create Backend Environment

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -e "apps/api[dev]"
```

Optional: copy `.env.example` to `.env` and change its development values.

### 2. Start The API

```powershell
.\.venv\Scripts\uvicorn worktrace_api.main:app --app-dir apps/api/src --reload
```

Useful URLs:

- Health check: `http://localhost:8000/health`
- Swagger UI: `http://localhost:8000/docs`

### 3. Build The Chrome Extension

```powershell
cd apps/extension
node scripts/build.mjs
cd ../..
```

### 4. Load The Extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `apps/extension/dist`.

### 5. Record A Workflow

1. Open a normal `http` or `https` browser page.
2. Click the WorkTrace extension icon.
3. Enter a workflow name.
4. Confirm the API URL, tenant ID, and development token.
5. Review and accept the capture consent statement.
6. Optionally enable microphone narration.
7. Start recording, perform the workflow, then stop.

The recording should upload and reach `validating`. It will not automatically
become an SOP until the missing processing pipeline is implemented.

## Configuration

Important environment variables from `.env.example`:

| Variable | Meaning |
|---|---|
| `WORKTRACE_ENV` | Runtime mode, such as `development`. |
| `WORKTRACE_DATABASE_URL` | Database connection; defaults to local SQLite. |
| `WORKTRACE_RECORDING_STORAGE_PATH` | Folder where raw recording chunks are stored. |
| `WORKTRACE_MAX_CHUNK_BYTES` | Maximum accepted chunk size; defaults to 10 MB. |
| `WORKTRACE_TENANT_ID` | Company/tenant identifier accepted by this deployment. |
| `WORKTRACE_API_TOKEN` | Prototype bearer token. Must be replaced outside development. |
| `WORKTRACE_ALLOWED_ORIGINS` | Web origins allowed to call the API from a browser. |
| `WORKTRACE_ALLOWED_DOMAINS` | Domains accepted when structured sessions are submitted. |
| `WORKTRACE_AI_PROVIDER` | Name shown for the configured AI provider. |
| `WORKTRACE_EXTERNAL_AI_ENABLED` | Planned switch for external AI calls. |
| `WORKTRACE_EXTERNAL_AI_APPROVAL_REQUIRED` | Planned approval requirement for external AI. |

Production mode refuses to start with the default development token or without
an explicit recording-domain allowlist.

## Running Tests

### Backend

```powershell
.\.venv\Scripts\python -m ruff check apps/api
.\.venv\Scripts\python -m pytest apps/api
```

### Extension

```powershell
cd apps/extension
node --test tests/*.test.mjs
node --check src/background.mjs
node scripts/build.mjs
cd ../..
```

### Shared Contracts

```powershell
node packages/contracts/scripts/validate-contracts.mjs
```

At the time this README was written, the implemented suites contained 22 API
tests, 16 extension tests, and six validated shared contracts.

## Known Limitations And Risks

- Uploaded recordings stop at `validating` because processing workers do not
  exist yet.
- Audio is captured but not transcribed.
- Screenshots are captured but not analysed or redacted server-side.
- The deterministic SOP generator works only with separately submitted
  structured sessions.
- The Chrome extension requests broad `http` and `https` host permissions for
  the prototype. Production should use administrator-configured allowed sites.
- Authentication is one tenant ID and bearer token, not OIDC/JWT.
- SQLite and local filesystem storage support one API host, not horizontal
  scaling.
- There are no Alembic production migrations despite Alembic being listed as a
  dependency.
- There is no React review/editor/dashboard application.
- There is no Docker Compose deployment yet.
- There is no complete raw-recording deletion API or retention scheduler.
- There is no penetration test, privacy impact assessment, or production legal
  review.

## Recommended Next Implementation Order

1. Build the recording-processing worker that turns raw chunks into a structured
   session.
2. Add local audio transcription.
3. Add screenshot redaction and evidence alignment.
4. Connect completed sessions to SOP generation.
5. Build the React review, editing, onboarding, and analytics application.
6. Replace SQLite/local files with PostgreSQL and MinIO.
7. Add Redis/RQ workers, migrations, OIDC, retention, and deletion workflows.
8. Add Docker Compose and real-company end-to-end testing.

## Development History

The project was intentionally built in reviewable milestones:

1. Repository architecture and contracts
2. Tenant-scoped backend core
3. Swagger API contract
4. Resumable recording upload
5. Browser recorder engine
6. Operable Chrome recorder

Each milestone has a corresponding explanation under `docs/commits/`.
