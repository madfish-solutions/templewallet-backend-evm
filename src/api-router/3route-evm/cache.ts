import { randomUUID } from 'crypto';

import { CodedError } from '../../utils/errors';

interface SharedCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiry: 'PX', ttl: number, condition: 'NX'): Promise<unknown>;
  eval(script: string, keyCount: number, ...args: Array<string | number>): Promise<unknown>;
}

interface CacheEntry<T> {
  value: T;
  updatedAt: number;
}

interface SharedCacheOptions<T> {
  store: SharedCacheStore;
  key: string;
  freshMs: number;
  retainMs: number;
  fetcher: () => Promise<T>;
}

interface SharedCache<T> {
  get(): Promise<T>;
  getOptional(): Promise<T | undefined>;
}

const LOCK_MS = 45_000;
const COLD_WAIT_MS = 8500;
const RETRY_MS = 10_000;
const publishScript = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  redis.call('set', KEYS[2], ARGV[2], 'PX', ARGV[3])
  return 1
end
return 0`;
const releaseScript = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

export const createSharedCache = <T>({
  store,
  key,
  freshMs,
  retainMs,
  fetcher
}: SharedCacheOptions<T>): SharedCache<T> => {
  let local: CacheEntry<T> | undefined;
  let refresh: Promise<T | undefined> | undefined;
  let retryAt = 0;
  const lockKey = `${key}:lock`;
  const validLocal = (): CacheEntry<T> | undefined =>
    local && Date.now() - local.updatedAt < retainMs ? local : undefined;

  const read = async (): Promise<CacheEntry<T> | undefined> => {
    const cached = validLocal();
    if (cached && (Date.now() - cached.updatedAt < freshMs || Date.now() < retryAt)) return cached;
    try {
      const raw = await store.get(key);
      if (raw) {
        const entry: CacheEntry<T> = JSON.parse(raw);
        if (Number.isFinite(entry.updatedAt) && Date.now() - entry.updatedAt < retainMs && entry.value !== undefined)
          local = entry;
      }
    } catch {
      // Use the retained local value if Redis is unavailable.
    }

    return validLocal();
  };

  const refreshValue = async (): Promise<T | undefined> => {
    const owner = randomUUID();
    let locked = false;
    try {
      locked = (await store.set(lockKey, owner, 'PX', LOCK_MS, 'NX')) === 'OK';
      if (!locked) return undefined;
    } catch {
      // Use the local refresh if Redis is unavailable.
    }
    try {
      const value = await fetcher();
      const entry = { value, updatedAt: Date.now() };
      if (locked) {
        try {
          const published = await store.eval(publishScript, 2, lockKey, key, owner, JSON.stringify(entry), retainMs);
          if (published !== 1) return undefined;
        } catch {
          // Retain the fetched value locally if Redis is unavailable.
        }
      }

      local = entry;

      return value;
    } finally {
      if (locked) {
        try {
          await store.eval(releaseScript, 1, lockKey, owner);
        } catch {
          // The lock expires if Redis cannot release it.
        }
      }
    }
  };

  const startRefresh = (): Promise<T | undefined> => {
    if (!refresh) {
      refresh = refreshValue()
        .catch(() => {
          throw new CodedError(503, 'The cached data is unavailable. Retry later.');
        })
        .finally(() => {
          retryAt = Date.now() + RETRY_MS;
          refresh = undefined;
        });
    }

    return refresh;
  };

  const getOptional = async (): Promise<T | undefined> => {
    const cached = await read();
    if ((!cached || Date.now() - cached.updatedAt >= freshMs) && Date.now() >= retryAt)
      void startRefresh().catch(() => undefined);

    return cached?.value;
  };

  return {
    getOptional,
    get: async (): Promise<T> => {
      const cached = await read();
      if (cached) {
        if (Date.now() - cached.updatedAt >= freshMs && Date.now() >= retryAt)
          void startRefresh().catch(() => undefined);

        return cached.value;
      }
      if (Date.now() < retryAt && !refresh) throw new CodedError(503, 'The token catalog is unavailable. Retry later.');
      const value = await startRefresh();
      if (value !== undefined) return value;
      const deadline = Date.now() + COLD_WAIT_MS;
      do {
        const shared = await read();
        if (shared) return shared.value;
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      throw new CodedError(503, 'The token catalog is unavailable. Retry later.');
    }
  };
};
