# Commit 003: Swagger API Contract

## What Changed

- Added a generated OpenAPI specification and Swagger regeneration command.
- Documented the endpoint groups and interactive Swagger UI location.
- Fixed audio-reference persistence and strengthened external-AI preview
  redaction before publishing the API contract.

## Why

The extension and web teams need an inspectable, stable API contract. Checking
in OpenAPI also makes contract changes visible during code review.

## Senior Review

- Security: external-AI previews no longer expose URL paths and redact common
  personal-data patterns in workflow and event text.
- Correctness: UUID audio references are serialized before persistence.
- Scalability: OpenAPI supports generated clients while route behavior remains
  separated from consumers.
- Residual risk: free-form secrets without recognizable patterns cannot be
  reliably identified; external AI remains approval-gated and should receive
  only deliberately reviewed payloads.
