const encoder = new TextEncoder();

export async function sha256(payload) {
  const buffer =
    payload instanceof Blob
      ? await payload.arrayBuffer()
      : payload instanceof ArrayBuffer
        ? payload
        : encoder.encode(String(payload)).buffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createChunk({
  recordingId,
  index,
  contentType,
  timestampStartMs,
  timestampEndMs,
  payload,
  mediaType = "application/octet-stream",
}) {
  const blob = payload instanceof Blob ? payload : new Blob([payload], { type: mediaType });
  return {
    key: `${recordingId}:${index}`,
    recordingId,
    index,
    contentType,
    timestampStartMs,
    timestampEndMs,
    checksumSha256: await sha256(blob),
    idempotencyKey: `${recordingId}:${index}`,
    payloadSize: blob.size,
    payload: blob,
    attempts: 0,
    nextAttemptAt: 0,
  };
}
