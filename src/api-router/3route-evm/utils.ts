import { RateLimiterRedis } from 'rate-limiter-flexible';

import { redisClient } from '../../redis.js';

export const createRateLimiter = (keyPrefix: string, points: number, duration: number) =>
  new RateLimiterRedis({ storeClient: redisClient, keyPrefix, points, duration });
