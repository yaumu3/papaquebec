/** A `Storage` over a map, for tests that exercise persistence without a browser. */
export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** A storage that refuses every write, as a browser does once its quota is spent. */
export function fullStorage(): Storage {
  const inner = memoryStorage();
  return {
    getItem: (k) => inner.getItem(k),
    setItem: () => {
      throw new Error('quota exceeded');
    },
    removeItem: (k) => inner.removeItem(k),
    clear: () => inner.clear(),
    key: (i) => inner.key(i),
    get length() {
      return inner.length;
    },
  };
}
