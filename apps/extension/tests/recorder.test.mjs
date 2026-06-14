import assert from "node:assert/strict";
import test from "node:test";

import { MemoryStateStore, RecordingController } from "../src/core/recorder.mjs";

function fixture({ completeFails = false, persistFails = false, queueFails = false } = {}) {
  const chunks = [];
  const discarded = [];
  let completionAttempts = 0;
  const uploader = {
    createRecording: async () => ({ id: "recording-1" }),
    persist: async (chunk) => {
      if (persistFails) throw new Error("quota exceeded");
      chunks.push(chunk);
    },
    upload: async () => {
      if (queueFails) throw new Error("offline");
    },
    complete: async (_recordingId, count) => {
      completionAttempts += 1;
      if (completeFails && completionAttempts === 1) throw new Error("chunks pending");
      return { status: `validating-${count}` };
    },
    discard: async (recordingId) => {
      discarded.push(recordingId);
      return { discarded: true, remoteError: null };
    },
  };
  let now = 1_000;
  const controller = new RecordingController({
    stateStore: new MemoryStateStore(),
    uploader,
    clock: () => now,
    chunkFactory: async (chunk) => chunk,
  });
  return { controller, chunks, discarded, tick: (milliseconds) => (now += milliseconds) };
}

test("serializes mixed chunks with monotonic indexes", async () => {
  const { controller, chunks, tick } = fixture();
  await controller.start({ workflowName: "Approve invoice", tabId: 7 });
  tick(2_000);

  await Promise.all([
    controller.recordEvents([{ event_type: "click" }]),
    controller.recordScreenshot(new Blob(["image"], { type: "image/jpeg" }), 2_000),
  ]);

  assert.deepEqual(chunks.map((chunk) => chunk.index), [0, 1]);
  assert.deepEqual(chunks.map((chunk) => chunk.contentType), ["events", "screenshots"]);
  const state = await controller.current();
  assert.equal(state.eventCount, 1);
  assert.equal(state.screenshotCount, 1);
  assert.equal(state.nextChunkIndex, 2);
});

test("retains progress when immediate upload fails", async () => {
  const { controller, chunks } = fixture({ queueFails: true });
  await controller.start({ workflowName: "Approve invoice", tabId: 7 });

  const state = await controller.recordEvents([{ event_type: "navigation" }]);

  assert.equal(chunks.length, 1);
  assert.equal(state.nextChunkIndex, 1);
  assert.equal(state.error, null);
});

test("does not advance state when durable persistence fails", async () => {
  const { controller } = fixture({ persistFails: true });
  await controller.start({ workflowName: "Approve invoice", tabId: 7 });

  await assert.rejects(controller.recordEvents([{ event_type: "click" }]), /quota exceeded/);

  assert.equal((await controller.current()).nextChunkIndex, 0);
});

test("pause blocks capture and stop completes expected chunks", async () => {
  const { controller } = fixture();
  await controller.start({ workflowName: "Approve invoice", tabId: 7 });
  await controller.pause();
  await assert.rejects(controller.recordEvents([{ event_type: "click" }]), /not active/);
  await controller.resume();
  await controller.recordEvents([{ event_type: "click" }]);

  const stopped = await controller.stop();

  assert.equal(stopped.phase, "processing");
  assert.equal(stopped.remoteStatus, "validating-1");
});

test("creates a boundary event when stopped without captured activity", async () => {
  const { controller, chunks } = fixture();
  await controller.start({ workflowName: "Approve invoice", tabId: 7 });

  const stopped = await controller.stop();

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].contentType, "events");
  assert.equal(stopped.remoteStatus, "validating-1");
});

test("retries completion without creating duplicate chunks", async () => {
  const { controller, chunks } = fixture({ completeFails: true });
  await controller.start({ workflowName: "Approve invoice", tabId: 7 });
  await assert.rejects(controller.stop(), /chunks pending/);
  assert.equal((await controller.current()).phase, "uploading");

  const retried = await controller.retryCompletion();

  assert.equal(chunks.length, 1);
  assert.equal(retried.phase, "processing");
  assert.equal(retried.error, null);
});

test("records audio chunks in the shared sequence", async () => {
  const { controller, chunks } = fixture();
  await controller.start({ workflowName: "Approve invoice", tabId: 7, hasAudio: true });

  const state = await controller.recordAudio(
    new Blob(["audio"], { type: "audio/webm;codecs=opus" }),
    0,
    10_000,
  );

  assert.equal(chunks[0].contentType, "audio");
  assert.equal(state.audioCount, 1);
  assert.equal(state.nextChunkIndex, 1);
});

test("accepts the final audio chunk while paused", async () => {
  const { controller, chunks } = fixture();
  await controller.start({ workflowName: "Approve invoice", tabId: 7, hasAudio: true });
  await controller.pause();

  const state = await controller.recordAudio(new Blob(["final"]), 0, 2_000);

  assert.equal(chunks[0].contentType, "audio");
  assert.equal(state.phase, "paused");
});

test("records microphone failure without ending browser capture", async () => {
  const { controller } = fixture();
  await controller.start({ workflowName: "Approve invoice", tabId: 7, hasAudio: true });

  const state = await controller.markAudioUnavailable("Microphone permission denied");

  assert.equal(state.phase, "recording");
  assert.equal(state.audioEnabled, false);
  assert.match(state.audioError, /permission denied/);
});

test("discard clears active state and removes the remote recording", async () => {
  const { controller, discarded } = fixture();
  await controller.start({ workflowName: "Approve invoice", tabId: 7 });

  const result = await controller.discard();

  assert.deepEqual(discarded, ["recording-1"]);
  assert.equal(result.tabId, 7);
  assert.equal(await controller.current(), null);
});
