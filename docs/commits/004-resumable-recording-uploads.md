# Commit 004: Resumable Recording Uploads

## What Changed

- Added the compact recording API: create, chunk upload, complete, and status.
- Added tenant-scoped chunk metadata and local raw-object storage.
- Added checksum validation, idempotent retries, contiguous completion checks,
  and read-only processing status.
- Added a Manifest V3 upload core with IndexedDB persistence, exponential
  backoff, restart alarms, acknowledgement cleanup, and quota thresholds.
- Added backend and extension tests plus an updated checked-in Swagger contract.

## Why

WorkTrace records audio, structured events, and event-driven screenshots during
normal browser work. Durable chunks tolerate offline periods and service-worker
interruptions without the operational complexity of live media streaming.

## Senior Review

- Security: every API operation is tenant-scoped; raw chunks remain inside the
  tenant stack; checksums are verified even on duplicate retries; extension
  settings are restricted to trusted extension contexts.
- Reliability: chunks are persisted before upload, removed only after
  acknowledgement, retried with bounded backoff, and required contiguously
  before completion.
- Scalability: storage and processing are behind explicit boundaries. Replace
  the local chunk adapter with MinIO/S3 and enqueue RQ workers without changing
  the extension contract.
- Efficiency: uploads are bounded to 10 MB, lightweight events/audio continue
  when screenshot capture pauses at storage pressure, and status reads are
  side-effect free.
- Concurrency: uploaded byte and chunk counters use database-side increments so
  parallel chunk acknowledgements do not overwrite each other's totals.

## Residual Risks

- The recorder UI and actual DOM, screenshot, and microphone capture are not
  part of this transport milestone.
- Processing workers do not yet advance status after validation.
- Local filesystem storage is suitable for one API instance only; a shared
  object-store adapter is required before horizontal scaling.
- Production object storage must use conditional writes to handle simultaneous
  uploads of the same chunk index without an orphaned object.
- Production needs OIDC, migrations, retention/deletion jobs, malware/content
  validation, and explicit tenant-specific Chrome host permissions.
