import { redisClient } from '../redis';

const serializeCacheValue = <T>(value: T) => JSON.stringify(value ?? null);
const deserializeCacheValue = <T>(value: string | null): T | undefined => {
  if (value == null) return undefined;

  try {
    const parsed = JSON.parse(value) as T | null;

    return parsed === null ? undefined : parsed;
  } catch {
    return undefined;
  }
};

export const getCacheKey = (prefix: string, parts: Array<string | number | undefined>) =>
  `cache:${prefix}:${parts.map(part => (part == null ? 'null' : String(part))).join(':')}`;

export const getCachedValue = async <T>(key: string): Promise<T | undefined> => {
  try {
    return deserializeCacheValue<T>(await redisClient.get(key));
  } catch {
    return undefined;
  }
};

export const setCachedValue = async <T>(key: string, value: T, ttlSeconds: number): Promise<void> => {
  try {
    const payload = serializeCacheValue(value);
    if (payload == null) return;

    await redisClient.set(key, payload, 'EX', ttlSeconds);
  } catch {
    // Cache errors should not fail the request path.
  }
};

export const withRedisCache = async <T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> => {
  const cached = await getCachedValue<T>(key);
  if (cached !== undefined) return cached;

  const value = await fetcher();
  await setCachedValue(key, value, ttlSeconds);

  return value;
};
