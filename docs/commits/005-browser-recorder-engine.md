# Commit 005: Browser Recorder Engine

## What Changed

- Added durable recording state and serialized, monotonic chunk allocation.
- Added explicit-tab event capture with ten-second or 100-event batching.
- Added visible-tab JPEG screenshots every two seconds while recording.
- Added pause, resume, stop, final-event flush, and processing transitions.
- Added recorder concurrency, offline-progress, and lifecycle tests.

## Why

The upload transport needed an actual producer. This slice turns browser
activity into ordered evidence while keeping capture policy separate from the
popup and microphone surfaces.

## Senior Review

- Privacy: typed values and sensitive input changes are excluded. Content
  scripts remain dormant unless their tab matches the explicitly active
  recording.
- Reliability: every chunk reaches IndexedDB before recorder state advances,
  and chunk allocation is serialized so concurrent events and screenshots
  cannot reuse indexes.
- Efficiency: events batch at 100 or ten seconds and screenshots use JPEG at
  65% quality and 0.5 FPS.
- Scalability: browser capture, recorder coordination, and transport are
  separate modules with injectable dependencies and focused tests.

## Residual Risks

- Broad workflow-page permissions are acceptable for the prototype but must
  become administrator-configured allowed origins before production.
- Screenshots can contain sensitive visible information. The popup must make
  that consent explicit, and server-side redaction remains required.
- Microphone capture and user-facing controls are delivered in the next slice.
