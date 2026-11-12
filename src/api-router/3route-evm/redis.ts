import Redis from 'ioredis';

import { EnvVars } from '../../config';

// BullMQ requires unlimited retries on its separate Redis connection.
export const route3RedisClient = new Redis(EnvVars.REDIS_URL, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  commandTimeout: 500,
  connectTimeout: 1000
});
// Request handlers return connection errors through their normal responses.
route3RedisClient.on('error', () => undefined);
