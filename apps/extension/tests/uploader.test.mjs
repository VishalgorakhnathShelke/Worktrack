import assert from "node:assert/strict";
import test from "node:test";

import { createChunk } from "../src/core/chunks.mjs";
import { MemoryChunkStore } from "../src/core/store.mjs";
import { RecordingUploader } from "../src/core/uploader.mjs";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("deletes a chunk only after acknowledgement", async () => {
  const store = new MemoryChunkStore();
  const client = new RecordingUploader({
    apiUrl: "https://api.test",
    tenantId: "tenant",
    token: "token",
    store,
    fetchImpl: async (_url, options) => {
      assert.equal(options.body.get("payload_size"), "2");
      return response({ duplicate: false });
    },
  });
  const chunk = await createChunk({
    recordingId: "recording",
    index: 0,
    contentType: "events",
    timestampStartMs: 0,
    timestampEndMs: 10_000,
    payload: "{}",
  });

  await client.queue(chunk);

  assert.equal(chunk.payloadSize, 2);
  assert.equal((await store.list()).length, 0);
});

test("does not rebind the fetch implementation receiver", async () => {
  const store = new MemoryChunkStore();
  function receiverSensitiveFetch() {
    assert.equal(this, undefined);
    return Promise.resolve(response({ id: "recording" }));
  }
  const client = new RecordingUploader({
    apiUrl: "https://api.test",
    tenantId: "tenant",
    token: "token",
    store,
    fetchImpl: receiverSensitiveFetch,
  });

  const result = await client.createRecording("Invoice processing", false);

  assert.equal(result.id, "recording");
});

test("retains failed chunks and resumes them", async () => {
  const store = new MemoryChunkStore();
  let online = false;
  const client = new RecordingUploader({
    apiUrl: "https://api.test",
    tenantId: "tenant",
    token: "token",
    store,
    fetchImpl: async () => {
      if (!online) throw new Error("offline");
      return response({ duplicate: false });
    },
  });
  const chunk = await createChunk({
    recordingId: "recording",
    index: 0,
    contentType: "audio",
    timestampStartMs: 0,
    timestampEndMs: 10_000,
    payload: "audio",
  });

  await assert.rejects(client.queue(chunk), /offline/);
  assert.equal((await store.list()).length, 1);
  online = true;
  const pending = (await store.list())[0];
  await store.put({ ...pending, nextAttemptAt: 0 });
  await client.flush();
  assert.equal((await store.list()).length, 0);
});

test("reports quota thresholds", async () => {
  const store = new MemoryChunkStore();
  store.quota = async () => ({ usage: 90, quota: 100 });
  const client = new RecordingUploader({
    apiUrl: "https://api.test",
    tenantId: "tenant",
    token: "token",
    store,
  });

  assert.deepEqual(await client.storagePressure(), {
    ratio: 0.9,
    warn: true,
    pauseScreenshots: true,
  });
});

test("completion immediately retries chunks still under backoff", async () => {
  const store = new MemoryChunkStore();
  let uploads = 0;
  const client = new RecordingUploader({
    apiUrl: "https://api.test",
    tenantId: "tenant",
    token: "token",
    store,
    fetchImpl: async (url) => {
      if (url.endsWith("/complete")) return response({ status: "validating" });
      uploads += 1;
      return response({ duplicate: false });
    },
  });
  const chunk = await createChunk({
    recordingId: "recording",
    index: 0,
    contentType: "events",
    timestampStartMs: 0,
    timestampEndMs: 1,
    payload: "{}",
  });
  await store.put({ ...chunk, nextAttemptAt: Date.now() + 60_000 });

  const result = await client.complete("recording", 1);

  assert.equal(uploads, 1);
  assert.equal(result.status, "validating");
});

test("discard deletes remote recording and durable local chunks", async () => {
  const store = new MemoryChunkStore();
  const requests = [];
  await store.put({ key: "recording:0", recordingId: "recording", index: 0 });
  const client = new RecordingUploader({
    apiUrl: "https://api.test",
    tenantId: "tenant",
    token: "token",
    store,
    fetchImpl: async (url, options) => {
      requests.push({ url, method: options.method });
      return new Response(null, { status: 204 });
    },
  });

  const result = await client.discard("recording");

  assert.deepEqual(requests, [{ url: "https://api.test/recordings/recording", method: "DELETE" }]);
  assert.deepEqual(result, { discarded: true, remoteError: null });
  assert.equal((await store.list("recording")).length, 0);
});

test("discard clears local chunks when remote cleanup is unavailable", async () => {
  const store = new MemoryChunkStore();
  await store.put({ key: "recording:0", recordingId: "recording", index: 0 });
  const client = new RecordingUploader({
    apiUrl: "https://api.test",
    tenantId: "tenant",
    token: "token",
    store,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });

  const result = await client.discard("recording");

  assert.equal(result.remoteError, "offline");
  assert.equal((await store.list("recording")).length, 0);
});

test("does not requeue chunks after a discarded remote recording returns 404", async () => {
  const store = new MemoryChunkStore();
  const client = new RecordingUploader({
    apiUrl: "https://api.test",
    tenantId: "tenant",
    token: "token",
    store,
    fetchImpl: async () => response({ detail: "Recording not found" }, 404),
  });
  const chunk = await createChunk({
    recordingId: "recording",
    index: 0,
    contentType: "events",
    timestampStartMs: 0,
    timestampEndMs: 1,
    payload: "{}",
  });

  await assert.rejects(client.queue(chunk), /no longer exists/);

  assert.equal((await store.list("recording")).length, 0);
});
