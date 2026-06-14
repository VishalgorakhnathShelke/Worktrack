import { createChunk } from "./core/chunks.mjs";
import { IndexedDbChunkStore } from "./core/store.mjs";
import { RecordingUploader } from "./core/uploader.mjs";

const store = new IndexedDbChunkStore();

async function uploader() {
  const settings = await chrome.storage.local.get(["apiUrl", "tenantId", "token"]);
  return new RecordingUploader({
    apiUrl: settings.apiUrl ?? "http://localhost:8000",
    tenantId: settings.tenantId,
    token: settings.token,
    store,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse, (error) => sendResponse({ error: error.message }));
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

async function handleMessage(message) {
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
  throw new Error(`Unsupported message type: ${message.type}`);
}
