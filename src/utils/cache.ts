import { redisClient } from '../redis.js';

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

const getKeyPart = (parts: Array<string | number | undefined>) =>
  parts.map(part => (part == null ? 'null' : String(part))).join(':');
export const getCacheKey = (prefix: string, parts: Array<string | number | undefined>) =>
  `cache:${prefix}:${getKeyPart(parts)}`;
export const getHmCacheKeys = (parts: Array<string | number | undefined>[]) => parts.map(getKeyPart);

export const getCachedValue = async <T>(key: string) => {
  try {
    return deserializeCacheValue<T>(await redisClient.get(key));
  } catch {
    return undefined;
  }
};
export const getCachedHmValues = async <T>(hmKey: string, keys: string[]) => {
  try {
    return (await redisClient.hmget(hmKey, ...keys)).map(deserializeCacheValue<T>);
  } catch {
    return Array<undefined>(keys.length).fill(undefined);
  }
};

export const setCachedValue = async <T>(key: string, value: T, ttlSeconds: number) => {
  try {
    const payload = serializeCacheValue(value);
    if (payload == null) return;

    await redisClient.set(key, payload, 'EX', ttlSeconds);
  } catch {
    // Cache errors should not fail the request path.
  }
};

const getCacheHmRanksKey = (hmKey: string) => `ranks:${hmKey}`;
export const setCachedHmValues = async <T>(
  hmKey: string,
  values: Record<string, T>,
  ttlSeconds: number,
  maxSize: number,
  rank = Date.now()
) => {
  try {
    const inputKeys = Object.keys(values);
    const hsetexArgs: [
      key: string,
      secondsToken: 'EX',
      seconds: number,
      fieldsToken: 'FIELDS',
      numfields: number,
      ...data: (string | Buffer | number)[]
    ] = [
      hmKey,
      'EX',
      ttlSeconds,
      'FIELDS',
      inputKeys.length,
      ...Object.entries(values).flatMap(([key, value]) => [key, serializeCacheValue(value)])
    ];
    const ranksKey = getCacheHmRanksKey(hmKey);
    const zaddArgs: [key: string, ...scoreMembers: (string | number)[]] = [
      ranksKey,
      ...inputKeys.flatMap(key => [rank, key])
    ];
    const keysCountBefore = await redisClient.zcard(ranksKey);
    const keysToRemoveCount = keysCountBefore + inputKeys.length - maxSize;
    const lowestElements = keysToRemoveCount > 0 ? await redisClient.zrange(ranksKey, 0, keysToRemoveCount - 1) : [];
    const pipeline = redisClient.pipeline();
    if (lowestElements.length > 0) {
      pipeline.zrem(ranksKey, ...lowestElements);
      pipeline.hdel(hmKey, ...lowestElements);
    }
    pipeline.zadd(...zaddArgs);
    pipeline.hsetex(...hsetexArgs);

    return await pipeline.exec();
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
