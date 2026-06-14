const EVENT_LIMIT = 100;
const EVENT_FLUSH_MS = 10_000;
const SCREENSHOT_INTERVAL_MS = 2_000;
const SENSITIVE_PATTERN = /(password|passcode|secret|token|auth|otp|credit|card|cvv|cvc|ssn)/i;

let state = null;
let events = [];
let eventTimer = null;
let screenshotTimer = null;
let screenshotPending = false;
let indicator = null;

void refreshState();
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse, (error) => sendResponse({ error: error.message }));
  return true;
});

document.addEventListener("click", recordClick, true);
document.addEventListener("change", recordChange, true);
window.addEventListener("pagehide", () => void flushEvents());

async function refreshState() {
  state = await send({ type: "recorder-state" });
  configureTimers();
  if (state?.phase === "recording") {
    addEvent("navigation", document.documentElement, { page_url: location.href });
  }
}

async function handleMessage(message) {
  if (message.type === "worktrace-state-changed") {
    state = message.state;
    configureTimers();
    return { ok: true };
  }
  if (message.type === "worktrace-flush-events") {
    const pending = events;
    events = [];
    return { events: pending };
  }
  return { ignored: true };
}

function recordClick(event) {
  if (!isRecording()) return;
  addEvent("click", event.target, {
    element_text: cleanText(event.target?.innerText || event.target?.textContent),
  });
}

function recordChange(event) {
  if (!isRecording() || isSensitive(event.target)) return;
  addEvent("input", event.target, { element_text: fieldLabel(event.target) });
}

function addEvent(eventType, target, extra = {}) {
  events.push({
    timestamp: new Date().toISOString(),
    event_type: eventType,
    page_url: extra.page_url ?? location.href,
    safe_selector: safeSelector(target),
    element_text: extra.element_text ?? null,
  });
  if (events.length >= EVENT_LIMIT) void flushEvents();
}

async function flushEvents() {
  if (!events.length || !state?.recordingId) return;
  const pending = events;
  events = [];
  try {
    await send({ type: "record-events", recordingId: state.recordingId, events: pending });
  } catch {
    events.unshift(...pending);
  }
}

async function requestScreenshot() {
  if (!isRecording() || screenshotPending || isSensitive(document.activeElement)) return;
  screenshotPending = true;
  if (indicator) indicator.style.visibility = "hidden";
  try {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await send({ type: "capture-screenshot", recordingId: state.recordingId });
  } finally {
    if (indicator) indicator.style.visibility = "visible";
    screenshotPending = false;
  }
}

function configureTimers() {
  clearInterval(eventTimer);
  clearInterval(screenshotTimer);
  eventTimer = null;
  screenshotTimer = null;
  updateIndicator();
  if (!isRecording()) return;
  eventTimer = setInterval(() => void flushEvents(), EVENT_FLUSH_MS);
  screenshotTimer = setInterval(() => void requestScreenshot(), SCREENSHOT_INTERVAL_MS);
}

function updateIndicator() {
  if (!state || !["recording", "paused"].includes(state.phase)) {
    indicator?.remove();
    indicator = null;
    return;
  }
  indicator ??= document.createElement("div");
  indicator.id = "worktrace-recording-indicator";
  indicator.textContent = state.phase === "paused" ? "WorkTrace paused" : "WorkTrace recording";
  indicator.style.cssText = [
    "position:fixed", "z-index:2147483647", "top:14px", "right:14px",
    "padding:9px 12px", "border-radius:999px", "color:#fff",
    `background:${state.phase === "paused" ? "#9a6700" : "#c92a3d"}`,
    "box-shadow:0 8px 24px #0003", "font:700 12px/1.2 system-ui,sans-serif",
    "pointer-events:none",
  ].join(";");
  if (!indicator.isConnected) (document.body || document.documentElement).append(indicator);
}

function isRecording() {
  return state?.phase === "recording";
}

function isSensitive(element) {
  const attributes = [
    element?.type,
    element?.name,
    element?.id,
    element?.autocomplete,
    element?.getAttribute?.("aria-label"),
  ].filter(Boolean);
  return element?.type === "password" || attributes.some((value) => SENSITIVE_PATTERN.test(value));
}

function fieldLabel(element) {
  return cleanText(
    element?.getAttribute?.("aria-label")
      || element?.labels?.[0]?.innerText
      || element?.placeholder
      || element?.name,
  );
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

function safeSelector(element) {
  if (!element?.tagName) return null;
  if (element.id && !SENSITIVE_PATTERN.test(element.id)) return `#${CSS.escape(element.id)}`;
  const testId = element.getAttribute?.("data-testid");
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
  const role = element.getAttribute?.("role");
  return [element.tagName.toLowerCase(), role ? `[role="${CSS.escape(role)}"]` : ""].join("");
}

function send(message) {
  return chrome.runtime.sendMessage(message).then((response) => {
    if (response?.error) throw new Error(response.error);
    return response;
  });
}
