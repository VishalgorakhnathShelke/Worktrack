import { createChunk } from "./core/chunks.mjs";
import { IndexedDbChunkStore } from "./core/store.mjs";
import { RecordingUploader } from "./core/uploader.mjs";
import { ChromeStateStore, RecordingController } from "./core/recorder.mjs";
import { canCaptureVisibleTab, stateVisibleToSender } from "./core/tab-policy.mjs";

const store = new IndexedDbChunkStore();
const stateStore = new ChromeStateStore();
let recorderController;
let audioPort = null;
let audioSerial = Promise.resolve();
let audioRequestId = 0;
const audioRequests = new Map();

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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "worktrace-audio") return;
  audioPort = port;
  port.onMessage.addListener((message) => {
    audioSerial = audioSerial.then(
      () => handleAudioMessage(message),
      () => handleAudioMessage(message),
    );
  });
  port.onDisconnect.addListener(() => {
    audioPort = null;
    for (const request of audioRequests.values()) request.reject(new Error("Audio recorder closed"));
    audioRequests.clear();
  });
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
    const state = await recorder.current();
    return stateVisibleToSender(state, sender.tab?.id);
  }
  if (message.type === "start-recorder") {
    console.log("vishal recoring start")
    let state = await recorder.start(message);
    if (message.hasAudio) {
      try {
        await sendAudioCommand("start");
      } catch (error) {
        await forceCloseAudioDocument();
        state = await recorder.markAudioUnavailable(error.message);
      }
    }
    await notifyTab(state);
    return state;
  }
  if (message.type === "pause-recorder") {
    const current = await recorder.current();
    if (current?.audioEnabled) {
      try {
        await sendAudioCommand("pause");
      } catch (error) {
        await forceCloseAudioDocument();
        await recorder.markAudioUnavailable(`Microphone stopped: ${error.message}`);
      }
    }
    const state = await recorder.pause();
    await notifyTab(state);
    return state;
  }
  if (message.type === "resume-recorder") {
    const current = await recorder.current();
    if (current?.audioEnabled) {
      try {
        await sendAudioCommand("resume");
      } catch (error) {
        await forceCloseAudioDocument();
        await recorder.markAudioUnavailable(`Microphone stopped: ${error.message}`);
      }
    }
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
    if (!canCaptureVisibleTab(state, sender.tab)) return { skipped: "recorded-tab-not-visible" };
    const pressure = await client.storagePressure();
    if (pressure.pauseScreenshots) return { skipped: "storage-pressure" };
    const screenshot = await captureScreenshot(sender.tab.windowId);
    if (!screenshot) return { skipped: "screenshot-too-large" };
    return recorder.recordScreenshot(screenshot, Date.now() - state.startedAt);
  }
  if (message.type === "stop-recorder") {
    const state = await recorder.current();
    if (state?.audioEnabled) {
      try {
        await sendAudioCommand("stop");
      } catch {
        // Closing the offscreen document below guarantees microphone shutdown.
      } finally {
        await forceCloseAudioDocument();
      }
    }
    let response = { events: [] };
    try {
      response = await chrome.tabs.sendMessage(state.tabId, { type: "worktrace-flush-events" });
    } catch {
      // A restricted or closed tab may not have a content script to flush.
    }
    try {
      const completed = await recorder.stop(response?.events ?? []);
      await notifyTab(completed);
      return completed;
    } catch (error) {
      await notifyTab(await recorder.current());
      throw error;
    }
  }
  if (message.type === "retry-completion") {
    return recorder.retryCompletion();
  }
  if (message.type === "discard-recording") {
    const current = await recorder.current();
    if (!current) return { discarded: true, remoteError: null };
    if (current.audioEnabled && ["recording", "paused"].includes(current.phase)) {
      try {
        await sendAudioCommand("stop");
      } catch {
        // Closing the offscreen document below guarantees microphone shutdown.
      }
    }
    await forceCloseAudioDocument();
    const result = await recorder.discard();
    await notifyTab(null, result.tabId);
    return result;
  }
  throw new Error(`Unsupported message type: ${message.type}`);
}

async function ensureAudioDocument() {
  const documentUrl = chrome.runtime.getURL("offscreen.html");
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [documentUrl],
  });
  if (!contexts.length) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Capture consented microphone narration in durable ten-second chunks.",
    });
  }
  const deadline = Date.now() + 5_000;
  while (!audioPort && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!audioPort) throw new Error("Audio recorder did not start");
}

async function sendAudioCommand(command) {
  await ensureAudioDocument();
  const requestId = ++audioRequestId;
  const result = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      audioRequests.delete(requestId);
      reject(new Error(`Audio ${command} timed out`));
    }, 60_000);
    audioRequests.set(requestId, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });
  });
  audioPort.postMessage({ command, requestId });
  return result;
}

async function forceCloseAudioDocument() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (contexts.length) await chrome.offscreen.closeDocument();
  audioPort = null;
}

async function handleAudioMessage(message) {
  if (message.type === "audio-chunk") {
    const recorder = await controller();
    try {
      return await recorder.recordAudio(
        base64ToBlob(message.base64, message.mimeType),
        message.timestampStartMs,
        message.timestampEndMs,
      );
    } catch (error) {
      await recorder.markAudioUnavailable(`Audio chunk was not saved: ${error.message}`);
      throw error;
    }
  }
  if (message.type === "audio-result") {
    const request = audioRequests.get(message.requestId);
    if (!request) return;
    audioRequests.delete(message.requestId);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message);
  }
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function captureScreenshot(windowId) {
  for (const quality of [65, 40]) {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality });
    const blob = await (await fetch(dataUrl)).blob();
    if (blob.size <= 8 * 1024 * 1024) return blob;
  }
  return null;
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

async function notifyTab(state, tabId = state?.tabId) {
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "worktrace-state-changed", state });
  } catch {
    // Restricted browser pages do not host the content script.
  }
}
