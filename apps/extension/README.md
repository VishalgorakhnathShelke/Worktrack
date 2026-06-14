# WorkTrace Recorder Extension

This milestone implements the durable upload core used by the future recorder:

- completed chunks are written to IndexedDB before upload;
- acknowledged chunks are removed locally;
- failed chunks remain durable and can resume after service-worker restart;
- a one-minute MV3 alarm retries pending chunks after interruptions;
- screenshots can pause at 85% storage pressure while lightweight events/audio continue;
- completion is blocked until every local chunk is acknowledged.

The actual DOM-event, screenshot, microphone, popup, and review interfaces are
separate recorder milestones. Build the unpacked extension with:

```powershell
cd apps/extension
node --test tests/uploader.test.mjs
node scripts/build.mjs
```

Load `apps/extension/dist` through `chrome://extensions`.

The prototype stores API settings in extension-local storage restricted to
trusted extension contexts. Replace the prototype bearer token with short-lived
OIDC credentials before production use. Production builds must also restrict
`host_permissions` to the tenant API origin.
