/** JSON in web storage: a missing, unreadable or refused entry is no error to the scope. */

export function readJson(storage: Storage, key: string): unknown {
  try {
    const text = storage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** False when the browser refused the write, typically for want of space. */
export function writeJson(storage: Storage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
