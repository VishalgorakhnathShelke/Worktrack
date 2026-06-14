const port = chrome.runtime.connect({ name: "worktrace-audio" });
let recorder = null;
let stream = null;
let startedAt = 0;
let chunkStartedAt = 0;
const pendingChunks = new Set();

port.onMessage.addListener((message) => void handle(message));

async function handle(message) {
  try {
    if (message.command === "start") await start();
    if (message.command === "pause") recorder?.pause();
    if (message.command === "resume") recorder?.resume();
    if (message.command === "stop") await stop();
    port.postMessage({ type: "audio-result", requestId: message.requestId, ok: true });
  } catch (error) {
    port.postMessage({ type: "audio-result", requestId: message.requestId, error: error.message });
  }
}

async function start() {
  if (recorder?.state && recorder.state !== "inactive") return;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: false,
  });
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 48_000 });
  startedAt = Date.now();
  chunkStartedAt = 0;
  recorder.addEventListener("dataavailable", (event) => {
    if (!event.data.size) return;
    const chunkEndedAt = Date.now() - startedAt;
    const pending = sendChunk(event.data, chunkStartedAt, chunkEndedAt);
    chunkStartedAt = chunkEndedAt;
    pendingChunks.add(pending);
    void pending.finally(() => pendingChunks.delete(pending));
  });
  recorder.start(10_000);
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function stop() {
  if (!recorder || recorder.state === "inactive") return Promise.resolve();
  await new Promise((resolve) => {
    recorder.addEventListener("stop", () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      resolve();
    }, { once: true });
    recorder.stop();
  });
  await Promise.all([...pendingChunks]);
}

async function sendChunk(blob, timestampStartMs, timestampEndMs) {
  port.postMessage({
    type: "audio-chunk",
    base64: await blobToBase64(blob),
    mimeType: blob.type,
    timestampStartMs,
    timestampEndMs,
  });
}
