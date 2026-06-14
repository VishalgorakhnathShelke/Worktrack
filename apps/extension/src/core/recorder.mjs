const ACTIVE_RECORDING_KEY = "activeRecording";

export class RecordingController {
  constructor({ stateStore, uploader, chunkFactory, clock = () => Date.now() }) {
    this.stateStore = stateStore;
    this.uploader = uploader;
    this.chunkFactory = chunkFactory;
    this.clock = clock;
    this.serial = Promise.resolve();
  }

  current() {
    return this.stateStore.get(ACTIVE_RECORDING_KEY);
  }

  start({ workflowName, tabId, hasAudio = false }) {
    return this.run(async () => {
      const existing = await this.current();
      if (["recording", "paused", "uploading"].includes(existing?.phase)) {
        throw new Error("A recording is already active");
      }
      const remote = await this.uploader.createRecording(workflowName, hasAudio);
      const state = {
        recordingId: remote.id,
        workflowName,
        tabId,
        hasAudio,
        audioEnabled: hasAudio,
        audioError: null,
        phase: "recording",
        startedAt: this.clock(),
        pausedAt: null,
        nextChunkIndex: 0,
        eventCount: 0,
        screenshotCount: 0,
        audioCount: 0,
        error: null,
      };
      await this.save(state);
      return state;
    });
  }

  pause() {
    return this.run(async () => {
      const state = await this.requireActive();
      if (state.phase !== "recording") throw new Error("Recording is not active");
      return this.save({ ...state, phase: "paused", pausedAt: this.clock() });
    });
  }

  resume() {
    return this.run(async () => {
      const state = await this.requireActive();
      if (state.phase !== "paused") throw new Error("Recording is not paused");
      return this.save({ ...state, phase: "recording", pausedAt: null });
    });
  }

  recordEvents(events) {
    if (!events.length) return this.current();
    return this.append("events", JSON.stringify({ events }), "application/json", {
      eventCount: events.length,
    });
  }

  recordScreenshot(blob, timestampMs = this.clock()) {
    return this.append("screenshots", blob, blob.type || "image/jpeg", {
      screenshotCount: 1,
      timestampStartMs: timestampMs,
      timestampEndMs: timestampMs,
    });
  }

  recordAudio(blob, timestampStartMs, timestampEndMs) {
    return this.run(async () => {
      const state = await this.requireActive();
      if (!["recording", "paused"].includes(state.phase)) {
        throw new Error("Recording no longer accepts audio");
      }
      return this.appendNow(state, "audio", blob, blob.type || "audio/webm", {
        audioCount: 1,
        timestampStartMs,
        timestampEndMs,
      });
    });
  }

  markAudioUnavailable(error) {
    return this.run(async () => {
      const state = await this.requireActive();
      return this.save({ ...state, audioEnabled: false, audioError: error });
    });
  }

  stop(finalEvents = []) {
    return this.run(async () => {
      let state = await this.requireActive();
      if (!finalEvents.length && state.nextChunkIndex === 0) {
        finalEvents = [{
          event_type: "recording_boundary",
          timestamp: new Date(this.clock()).toISOString(),
        }];
      }
      if (finalEvents.length) state = await this.appendNow(
        state,
        "events",
        JSON.stringify({ events: finalEvents }),
        "application/json",
        { eventCount: finalEvents.length },
      );
      state = await this.save({ ...state, phase: "uploading", error: null });
      try {
        const remote = await this.uploader.complete(state.recordingId, state.nextChunkIndex);
        return this.save({ ...state, phase: "processing", remoteStatus: remote.status });
      } catch (error) {
        await this.save({ ...state, phase: "uploading", error: error.message });
        throw error;
      }
    });
  }

  retryCompletion() {
    return this.run(async () => {
      const state = await this.requireActive();
      if (state.phase !== "uploading") throw new Error("Recording is not awaiting upload");
      try {
        const remote = await this.uploader.complete(state.recordingId, state.nextChunkIndex);
        return this.save({ ...state, phase: "processing", remoteStatus: remote.status, error: null });
      } catch (error) {
        await this.save({ ...state, error: error.message });
        throw error;
      }
    });
  }

  append(contentType, payload, mediaType, counters = {}) {
    return this.run(async () => {
      const state = await this.requireRecording();
      return this.appendNow(state, contentType, payload, mediaType, counters);
    });
  }

  run(operation) {
    const result = this.serial.then(operation, operation);
    this.serial = result.catch(() => undefined);
    return result;
  }

  async appendNow(state, contentType, payload, mediaType, counters) {
    const timestampStartMs = counters.timestampStartMs ?? this.clock() - state.startedAt;
    const timestampEndMs = counters.timestampEndMs ?? this.clock() - state.startedAt;
    const chunk = await this.chunkFactory({
      recordingId: state.recordingId,
      index: state.nextChunkIndex,
      contentType,
      timestampStartMs: Math.max(0, timestampStartMs),
      timestampEndMs: Math.max(0, timestampEndMs),
      payload,
      mediaType,
    });
    const next = {
      ...state,
      nextChunkIndex: state.nextChunkIndex + 1,
      eventCount: state.eventCount + (counters.eventCount ?? 0),
      screenshotCount: state.screenshotCount + (counters.screenshotCount ?? 0),
      audioCount: state.audioCount + (counters.audioCount ?? 0),
    };
    await this.uploader.persist(chunk);
    await this.save(next);
    try {
      await this.uploader.upload(chunk);
    } catch {
      // The chunk is already durable and a later retry alarm will upload it.
    }
    return next;
  }

  async requireActive() {
    const state = await this.current();
    if (!state) throw new Error("No recording exists");
    return state;
  }

  async requireRecording() {
    const state = await this.requireActive();
    if (state.phase !== "recording") throw new Error("Recording is not active");
    return state;
  }

  async save(state) {
    await this.stateStore.set(ACTIVE_RECORDING_KEY, state);
    return state;
  }
}

export class ChromeStateStore {
  constructor(storage = chrome.storage.local) {
    this.storage = storage;
  }

  async get(key) {
    return (await this.storage.get(key))[key] ?? null;
  }

  async set(key, value) {
    await this.storage.set({ [key]: value });
  }
}

export class MemoryStateStore {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async set(key, value) {
    this.values.set(key, value);
  }
}
