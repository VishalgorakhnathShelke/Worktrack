const DATABASE_NAME = "worktrace-recorder";
const STORE_NAME = "pending-chunks";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbChunkStore {
  constructor(indexedDb = globalThis.indexedDB) {
    this.indexedDb = indexedDb;
    this.database = null;
  }

  async open() {
    if (this.database) return this.database;
    const request = this.indexedDb.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    this.database = await requestResult(request);
    return this.database;
  }

  async put(chunk) {
    const database = await this.open();
    await requestResult(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(chunk));
  }

  async list(recordingId) {
    const database = await this.open();
    const chunks = await requestResult(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll(),
    );
    return chunks
      .filter((chunk) => !recordingId || chunk.recordingId === recordingId)
      .sort((left, right) => left.index - right.index);
  }

  async delete(key) {
    const database = await this.open();
    await requestResult(
      database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key),
    );
  }

  async deleteRecording(recordingId) {
    const chunks = await this.list(recordingId);
    const database = await this.open();
    const store = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
    await Promise.all(chunks.map((chunk) => requestResult(store.delete(chunk.key))));
  }

  async quota() {
    return navigator.storage.estimate();
  }
}

export class MemoryChunkStore {
  constructor() {
    this.chunks = new Map();
  }

  async put(chunk) {
    this.chunks.set(chunk.key, chunk);
  }

  async list(recordingId) {
    return [...this.chunks.values()]
      .filter((chunk) => !recordingId || chunk.recordingId === recordingId)
      .sort((left, right) => left.index - right.index);
  }

  async delete(key) {
    this.chunks.delete(key);
  }

  async deleteRecording(recordingId) {
    for (const chunk of await this.list(recordingId)) this.chunks.delete(chunk.key);
  }

  async quota() {
    return { usage: 0, quota: Number.MAX_SAFE_INTEGER };
  }
}
