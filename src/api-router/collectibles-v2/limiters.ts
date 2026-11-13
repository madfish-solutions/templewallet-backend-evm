import { RateLimiterRedis } from 'rate-limiter-flexible';

import { redisClient } from '../../redis.js';

export const openseaCacheLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-opensea-cache',
  points: 30,
  duration: 60
});

export const openseaCacheWalletLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-opensea-cache-wallet',
  points: 30,
  duration: 60
});

export const openseaLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-opensea',
  points: 30,
  duration: 60
});

export const openseaWalletLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-opensea-wallet',
  points: 30,
  duration: 60
});

export const alchemyCollectiblesLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-alchemy-collectibles',
  points: 30,
  duration: 60
});

export const alchemyCollectiblesWalletLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-alchemy-collectibles-wallet',
  points: 30,
  duration: 60
});
