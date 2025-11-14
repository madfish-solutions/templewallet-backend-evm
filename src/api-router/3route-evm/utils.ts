import { RateLimiterRedis } from 'rate-limiter-flexible';

import { redisClient } from '../../redis';

export const withRateLimiter = <A extends unknown[], R>(limiter: RateLimiterRedis, fn: (...args: A) => Promise<R>) => {
  return async (...args: A) => {
    let consumed = false;
    while (!consumed) {
      try {
        await limiter.consume('backend');
        consumed = true;
      } catch {
        await new Promise(resolve => setTimeout(resolve, limiter.blockDuration * 1000));
      }
    }

    return fn(...args);
  };
};

export const createRateLimiter = (keyPrefix: string, points: number, duration: number) =>
  new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix,
    points,
    duration,
    blockDuration: Math.max(Math.ceil(duration / points), 1)
  });
