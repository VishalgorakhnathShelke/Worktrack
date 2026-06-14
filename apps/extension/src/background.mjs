import { createChunk } from "./core/chunks.mjs";
import { IndexedDbChunkStore } from "./core/store.mjs";
import { RecordingUploader } from "./core/uploader.mjs";
import { ChromeStateStore, RecordingController } from "./core/recorder.mjs";

const store = new IndexedDbChunkStore();
const stateStore = new ChromeStateStore();
let recorderController;

async function uploader() {
  const settings = await chrome.storage.local.get(["apiUrl", "tenantId", "token"]);
  return new RecordingUploader({
    apiUrl: settings.apiUrl ?? "http://localhost:8000",
    tenantId: settings.tenantId,
    token: settings.token,
    store,
  });
}

async function controller() {
  recorderController ??= new RecordingController({
    stateStore,
    uploader: await uploader(),
    chunkFactory: createChunk,
  });
  return recorderController;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse, (error) =>
    sendResponse({ error: error.message }),
  );
  return true;
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureRetryAlarm();
  const client = await uploader();
  await client.flush();
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await ensureRetryAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "flush-pending") return;
  const client = await uploader();
  await client.flush();
});

async function ensureRetryAlarm() {
  const existing = await chrome.alarms.get("flush-pending");
  if (!existing) await chrome.alarms.create("flush-pending", { periodInMinutes: 1 });
}

async function handleMessage(message, sender) {
  const client = await uploader();
  if (message.type === "create-recording") {
    return client.createRecording(message.workflowName, message.hasAudio);
  }
  if (message.type === "queue-chunk") {
    const chunk = await createChunk(message.chunk);
    return client.queue(chunk);
  }
  if (message.type === "complete-recording") {
    return client.complete(message.recordingId, message.expectedChunkCount);
  }
  if (message.type === "recording-status") {
    return client.status(message.recordingId);
  }
  if (message.type === "storage-pressure") {
    return client.storagePressure();
  }
  const recorder = await controller();
  if (message.type === "recorder-state") {
    return recorder.current();
  }
  if (message.type === "start-recorder") {
    const state = await recorder.start(message);
    await notifyTab(state);
    return state;
  }
  if (message.type === "pause-recorder") {
    const state = await recorder.pause();
    await notifyTab(state);
    return state;
  }
  if (message.type === "resume-recorder") {
    const state = await recorder.resume();
    await notifyTab(state);
    return state;
  }
  if (message.type === "record-events") {
    await requireRecordingSender(recorder, sender, message.recordingId);
    return recorder.recordEvents(message.events);
  }
  if (message.type === "capture-screenshot") {
    const state = await requireRecordingSender(recorder, sender, message.recordingId);
    const pressure = await client.storagePressure();
    if (pressure.pauseScreenshots) return { skipped: "storage-pressure" };
    const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format: "jpeg",
      quality: 65,
    });
    return recorder.recordScreenshot(await (await fetch(dataUrl)).blob(), Date.now() - state.startedAt);
  }
  if (message.type === "stop-recorder") {
    const state = await recorder.current();
    let response = { events: [] };
    try {
      response = await chrome.tabs.sendMessage(state.tabId, { type: "worktrace-flush-events" });
    } catch {
      // A restricted or closed tab may not have a content script to flush.
    }
    const completed = await recorder.stop(response?.events ?? []);
    await notifyTab(completed);
    return completed;
  }
  throw new Error(`Unsupported message type: ${message.type}`);
}

async function requireRecordingSender(recorder, sender, recordingId) {
  const state = await recorder.current();
  if (
    !state
    || state.phase !== "recording"
    || state.recordingId !== recordingId
    || state.tabId !== sender.tab?.id
  ) {
    throw new Error("Recording message does not match the active tab");
  }
  return state;
}

async function notifyTab(state) {
  try {
    await chrome.tabs.sendMessage(state.tabId, { type: "worktrace-state-changed", state });
  } catch {
    // Restricted browser pages do not host the content script.
  }
}
