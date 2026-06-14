const stages = [
  "recording",
  "uploading",
  "validating",
  "transcribing_audio",
  "processing_screenshots",
  "aligning_evidence",
  "generating_sop",
  "ready_for_review",
  "completed",
];

const elements = Object.fromEntries(
  [...document.querySelectorAll("[id]")].map((element) => [element.id, element]),
);
let state = null;
let activeTab = null;
let refreshTimer = null;

await loadSettings();
activeTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
startPolling();
await refresh();

elements["capture-consent"].addEventListener("change", validateStart);
elements["workflow-name"].addEventListener("input", validateStart);
elements["start-button"].addEventListener("click", start);
elements["pause-button"].addEventListener("click", togglePause);
elements["stop-button"].addEventListener("click", stop);
elements["retry-button"].addEventListener("click", retryCompletion);
elements["polling-button"].addEventListener("click", togglePolling);
elements["discard-active-button"].addEventListener("click", discardRecording);
elements["discard-processing-button"].addEventListener("click", discardRecording);

async function start() {
  await run(async () => {
    if (!/^https?:/.test(activeTab?.url || "")) throw new Error("Open a normal website tab first");
    await saveSettings();
    state = await send({
      type: "start-recorder",
      workflowName: elements["workflow-name"].value.trim(),
      hasAudio: elements["include-audio"].checked,
      tabId: activeTab.id,
    });
    startPolling();
    render();
  });
}

async function togglePause() {
  await run(async () => {
    state = await send({ type: state.phase === "paused" ? "resume-recorder" : "pause-recorder" });
    render();
  });
}

async function stop() {
  await run(async () => {
    state = await send({ type: "stop-recorder" });
    render();
  });
}

async function retryCompletion() {
  await run(async () => {
    state = await send({ type: "retry-completion" });
    render();
  });
}

async function discardRecording() {
  if (!confirm("Discard this recording and permanently delete its captured evidence?")) return;
  await run(async () => {
    const result = await send({ type: "discard-recording" });
    stopPolling();
    state = null;
    render();
    if (result.remoteError) {
      showError(`Recording discarded locally. Server cleanup was not confirmed: ${result.remoteError}`);
    }
  });
}

function startPolling() {
  if (refreshTimer !== null) return;
  refreshTimer = setInterval(() => void refresh(), 1_000);
}

function stopPolling() {
  if (refreshTimer === null) return;
  clearInterval(refreshTimer);
  refreshTimer = null;
}

function togglePolling() {
  if (refreshTimer === null) {
    startPolling();
    void refresh();
  } else {
    stopPolling();
    render();
  }
}

async function refresh() {
  try {
    state = await send({ type: "recorder-state" });
    if (state?.phase === "processing") {
      const status = await send({ type: "recording-status", recordingId: state.recordingId });
      state = { ...state, remoteStatus: status.recording.status };
    }
    render();
    if (state?.remoteStatus === "completed") stopPolling();
  } catch (error) {
    showError(error);
  }
}

function render() {
  const phase = state?.remoteStatus === "completed" ? "completed" : state?.phase ?? "idle";
  elements["setup-panel"].hidden = phase !== "idle" && phase !== "completed";
  elements["active-panel"].hidden = !["recording", "paused"].includes(phase);
  elements["processing-panel"].hidden = !["uploading", "processing"].includes(phase);
  elements["phase-pill"].className = `pill ${phase}`;
  elements["phase-pill"].textContent = title(phase);
  if (!state) return validateStart();

  elements["active-workflow"].textContent = state.workflowName;
  elements["event-count"].textContent = state.eventCount;
  elements["screenshot-count"].textContent = state.screenshotCount;
  elements["audio-count"].textContent = state.audioCount;
  elements["elapsed"].textContent = formatDuration(Date.now() - state.startedAt);
  elements["pause-button"].textContent = phase === "paused" ? "Resume" : "Pause";

  const remoteStage = state.remoteStatus || phase;
  elements["processing-stage"].textContent = title(remoteStage);
  elements["processing-message"].textContent =
    state.error ||
    (refreshTimer === null
      ? "Status checking paused. Server processing continues."
      : "WorkTrace is preparing your evidence.");
  elements["polling-button"].textContent =
    refreshTimer === null ? "Resume checking status" : "Stop checking status";
  elements["retry-button"].hidden = phase !== "uploading";
  elements["error-message"].textContent = state.audioError || "";
  const stageIndex = Math.max(0, stages.indexOf(remoteStage));
  elements["progress-bar"].style.width = `${((stageIndex + 1) / stages.length) * 100}%`;
}

function validateStart() {
  elements["start-button"].disabled =
    !elements["capture-consent"].checked || !elements["workflow-name"].value.trim();
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(["apiUrl", "tenantId", "token"]);
  elements["api-url"].value = settings.apiUrl ?? elements["api-url"].value;
  elements["tenant-id"].value = settings.tenantId ?? elements["tenant-id"].value;
  elements["api-token"].value = settings.token ?? elements["api-token"].value;
}

async function saveSettings() {
  await chrome.storage.local.set({
    apiUrl: elements["api-url"].value.trim().replace(/\/$/, ""),
    tenantId: elements["tenant-id"].value.trim(),
    token: elements["api-token"].value,
  });
}

async function run(operation) {
  elements["error-message"].textContent = "";
  try {
    await operation();
  } catch (error) {
    showError(error);
  }
}

function send(message) {
  console.log(message);
  return chrome.runtime.sendMessage(message).then((response) => {
    if (response?.error) throw new Error(response.error);
    return response;
  });
}

function showError(error) {
  elements["error-message"].textContent = error.message;
}

function title(value) {
  return String(value || "idle").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
