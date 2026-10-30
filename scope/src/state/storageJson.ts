/** JSON in web storage: a missing, unreadable or refused entry is no error to the scope. */

export function readJson(storage: Storage, key: string): unknown {
  try {
    const text = storage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Best effort: a write the browser refuses, typically for want of space, is dropped. */
export function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {}
}
