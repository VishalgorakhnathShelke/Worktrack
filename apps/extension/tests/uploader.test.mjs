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
