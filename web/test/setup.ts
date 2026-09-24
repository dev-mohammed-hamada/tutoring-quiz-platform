/**
 * Node 20+ ships its own experimental `localStorage` global. Under Vitest it wins
 * over jsdom's, and it arrives as a bare object with none of the Storage methods,
 * so anything that reads a stored preference explodes on import. Real browsers are
 * unaffected; this restores the Storage contract the app is written against.
 */
if (typeof window.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}
