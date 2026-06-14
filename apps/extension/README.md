# WorkTrace Recorder Extension

The extension is now an operable Manifest V3 recorder:

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
- a popup collects explicit consent and controls start, pause, resume, and stop;
- a visible in-page badge makes recording state unambiguous but hides itself
  before screenshots;
- optional microphone narration uses an offscreen MediaRecorder and ten-second
  WebM/Opus chunks;
- the popup displays evidence counts, upload errors, retry controls, and backend
  processing state.

Build the unpacked extension with:

```powershell
cd apps/extension
node --test tests/*.test.mjs
node scripts/build.mjs
```

Load `apps/extension/dist` through `chrome://extensions`.

## Development Reload

Run the development watcher from Windows PowerShell:

```powershell
cd apps/extension
npm run dev
```

The watcher rebuilds `dist` whenever `manifest.json` or a file under `src`
changes. Keep the unpacked extension pointed at `apps/extension/dist`.

Chrome does not provide full hot module reload for unpacked Manifest V3
extensions:

- popup changes are visible after closing and reopening the popup;
- background service-worker or manifest changes require clicking **Reload** for
  WorkTrace in `chrome://extensions`;
- content-script changes require reloading the extension and then refreshing
  the workflow tab.

To inspect background errors, open `chrome://extensions`, enable Developer mode,
and click the WorkTrace service-worker link under **Inspect views**.

## Use

1. Start the WorkTrace API on `http://localhost:8000`.
2. Open a normal `http` or `https` workflow tab.
3. Click the WorkTrace toolbar action.
4. Enter the workflow name and connection settings.
5. Review capture consent, optionally enable microphone narration, and start.
6. Pause, resume, or stop from the popup. Pending chunks can be retried there.

The prototype stores API settings in extension-local storage restricted to
trusted extension contexts. Replace the prototype bearer token with short-lived
OIDC credentials before production use. The content script is dormant until a
recording starts. Production packaging should replace broad workflow host
permissions with administrator-configured allowed origins.

## Prototype Boundaries

- Chrome will request microphone permission when narration first starts.
- The current API has no processing workers yet, so completed recordings remain
  at `validating` until the worker milestone.
- Production needs administrator-configured allowed origins, OIDC, screenshot
  redaction, retention controls, and a shared object-store backend.
