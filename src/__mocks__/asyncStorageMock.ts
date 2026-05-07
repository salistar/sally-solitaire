/**
 * Mock simple en mémoire pour AsyncStorage. Utilisé par les tests Jest.
 */

const storage: Record<string, string> = {};

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return storage[key] ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    storage[key] = value;
  },
  async removeItem(key: string): Promise<void> {
    delete storage[key];
  },
  async getAllKeys(): Promise<string[]> {
    return Object.keys(storage);
  },
  async clear(): Promise<void> {
    for (const k of Object.keys(storage)) delete storage[k];
  },
  async multiGet(keys: string[]): Promise<[string, string | null][]> {
    return keys.map((k) => [k, storage[k] ?? null]);
  },
};

export default AsyncStorage;
