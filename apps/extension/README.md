# WorkTrace Recorder Extension

The extension now includes the durable upload core and browser recorder engine:

- completed chunks are written to IndexedDB before upload;
- acknowledged chunks are removed locally;
- failed chunks remain durable and can resume after service-worker restart;
- a one-minute MV3 alarm retries pending chunks after interruptions;
- screenshots can pause at 85% storage pressure while lightweight events/audio continue;
- completion is blocked until every local chunk is acknowledged.
- only the explicitly started browser tab records events or screenshots;
- clicks, navigation, and non-sensitive field changes flush every 100 events or
  ten seconds;
- typed values are never captured;
- visible-tab JPEG screenshots are requested every two seconds while recording.

The popup, consent controls, microphone recorder, and processing-status view are
the next recorder milestone. Build the unpacked extension with:

```powershell
cd apps/extension
node --test tests/uploader.test.mjs
node scripts/build.mjs
```

Load `apps/extension/dist` through `chrome://extensions`.

The prototype stores API settings in extension-local storage restricted to
trusted extension contexts. Replace the prototype bearer token with short-lived
OIDC credentials before production use. The content script is dormant until a
recording starts. Production packaging should replace broad workflow host
permissions with administrator-configured allowed origins.
