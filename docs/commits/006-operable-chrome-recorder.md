# Commit 006: Operable Chrome Recorder

## What Changed

- Added a polished popup for consent, workflow naming, connection settings,
  evidence counters, controls, retry, and processing state.
- Added an always-visible recording/paused badge that hides before screenshots.
- Added optional offscreen microphone capture in ten-second WebM/Opus chunks.
- Added graceful microphone-denial behavior and final audio capture while
  paused.
- Added oversized-screenshot fallback, completion retry, and manifest tests.

## Why

The transport and recorder engine were not useful without a surface that a
participant could safely operate. This slice completes the prototype recording
experience from explicit consent through backend processing status.

## Senior Review

- Privacy: recording requires explicit screenshot/action consent, typed values
  remain excluded, sensitive focused fields suppress screenshots, and the
  recording badge is always visible to the participant. State and screenshots
  are additionally locked to the explicitly selected active tab. Consent copy
  explicitly warns that screenshots may contain any visible information.
- Reliability: microphone denial does not terminate browser capture, final
  paused audio is retained, failed completion is retryable, and oversized
  screenshots are recompressed or skipped before entering the durable queue.
  Failed pause or stop commands force-close the audio document to prevent
  background microphone capture. Explicit stop/retry actions immediately
  attempt pending chunks instead of waiting for background backoff.
- Efficiency: microphone audio uses 48 kbps Opus, screenshots use bounded JPEG,
  and all evidence shares one ordered resumable upload path.
- Scalability: popup, content capture, offscreen media, recorder coordination,
  and transport remain independent modules.

## Verification

- Extension unit tests and syntax checks.
- Manifest surface contract test.
- Unpacked extension build.
- Full API regression tests and shared contract validation.

## Residual Risks

- The browser preview surface was unavailable during automated visual review;
  popup markup and styles were inspected and the unpacked build was verified.
- Production still requires administrator-configured origins, OIDC, server-side
  screenshot redaction, retention/deletion jobs, shared object storage, and
  processing workers.
