// Instagram's media-container API fetches the image from a public URL rather
// than accepting a direct upload, so uploaded files are held here briefly and
// served back over HTTP just long enough for Instagram to retrieve them.
interface StoredUpload {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const store = new Map<string, StoredUpload>();

export function putUpload(buffer: Buffer, contentType: string): string {
  const id = crypto.randomUUID();
  store.set(id, { buffer, contentType, expiresAt: Date.now() + TTL_MS });
  return id;
}

export function getUpload(id: string): StoredUpload | undefined {
  const entry = store.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(id);
    return undefined;
  }
  return entry;
}

export function deleteUpload(id: string): void {
  store.delete(id);
}
