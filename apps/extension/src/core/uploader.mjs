const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

export class RecordingUploader {
  constructor({ apiUrl, tenantId, token, store, fetchImpl = fetch }) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.tenantId = tenantId;
    this.token = token;
    this.store = store;
    this.fetch = fetchImpl;
  }

  headers() {
    return { "X-Tenant-ID": this.tenantId, Authorization: `Bearer ${this.token}` };
  }

  async createRecording(workflowName, hasAudio) {
    const response = await this.fetch(`${this.apiUrl}/recordings`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_name: workflowName, has_audio: hasAudio }),
    });
    return checkedJson(response);
  }

  async queue(chunk) {
    await this.persist(chunk);
    return this.upload(chunk);
  }

  async persist(chunk) {
    await this.store.put(chunk);
  }

  async upload(chunk) {
    const form = new FormData();
    form.set("content_type", chunk.contentType);
    form.set("timestamp_start_ms", String(chunk.timestampStartMs));
    form.set("timestamp_end_ms", String(chunk.timestampEndMs));
    form.set("checksum_sha256", chunk.checksumSha256);
    form.set("idempotency_key", chunk.idempotencyKey);
    form.set("payload_size", String(chunk.payloadSize));
    form.set("file", chunk.payload, `chunk-${chunk.index}.bin`);

    try {
      const response = await this.fetch(
        `${this.apiUrl}/recordings/${chunk.recordingId}/chunks/${chunk.index}`,
        { method: "PUT", headers: this.headers(), body: form },
      );
      const receipt = await checkedJson(response);
      await this.store.delete(chunk.key);
      return receipt;
    } catch (error) {
      const attempts = chunk.attempts + 1;
      const retryDelay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
      await this.store.put({ ...chunk, attempts, nextAttemptAt: Date.now() + retryDelay });
      throw error;
    }
  }

  async flush(recordingId, { force = false } = {}) {
    const pending = await this.store.list(recordingId);
    const results = [];
    for (const chunk of pending) {
      if (!force && chunk.nextAttemptAt > Date.now()) continue;
      try {
        results.push(await this.upload(chunk));
      } catch {
        // A later alarm or reconnect event retries durable pending chunks.
      }
    }
    return results;
  }

  async complete(recordingId, expectedChunkCount) {
    await this.flush(recordingId, { force: true });
    const pending = await this.store.list(recordingId);
    if (pending.length) throw new Error(`${pending.length} chunks remain unacknowledged`);
    const response = await this.fetch(`${this.apiUrl}/recordings/${recordingId}/complete`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ expected_chunk_count: expectedChunkCount }),
    });
    return checkedJson(response);
  }

  async status(recordingId) {
    const response = await this.fetch(`${this.apiUrl}/recordings/${recordingId}/status`, {
      headers: this.headers(),
    });
    return checkedJson(response);
  }

  async storagePressure() {
    const { usage = 0, quota = 0 } = await this.store.quota();
    const ratio = quota ? usage / quota : 0;
    return { ratio, warn: ratio >= 0.7, pauseScreenshots: ratio >= 0.85 };
  }
}

async function checkedJson(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail ?? `Request failed: ${response.status}`);
  return body;
}
