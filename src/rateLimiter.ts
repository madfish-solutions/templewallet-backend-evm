import { NextFunction, Request, Response } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';

import { redisClient } from './redis';

export const covalentLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-covalent',
  points: 60,
  duration: 60,
  blockDuration: 60
});

export const covalentWalletLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-covalent-wallet',
  points: 40,
  duration: 60,
  blockDuration: 60
});

export const initializedLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-is-initialized',
  points: 10,
  duration: 60,
  blockDuration: 60
});

export const initializedWalletLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-is-initialized-wallet',
  points: 1,
  duration: 60,
  blockDuration: 60
});

export const txLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-transactions',
  points: 30,
  duration: 60,
  blockDuration: 60
});

export const txWalletLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-transactions-wallet',
  points: 20,
  duration: 60,
  blockDuration: 60
});

export const lifiLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-lifi',
  points: 60,
  duration: 60,
  blockDuration: 60
});

export const everstakeLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-everstake',
  points: 120,
  duration: 60,
  blockDuration: 60
});

type KeyGenerator = (req: Request) => string | undefined;

const getFirstStringValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];

  return undefined;
};

const getIpKey: KeyGenerator = req =>
  getFirstStringValue(req.headers['do-connecting-ip']) ?? getFirstStringValue(req.ip);

export const walletAddressKeyGenerator: KeyGenerator = req =>
  getFirstStringValue(req.query.walletAddress) ?? getFirstStringValue(req.body?.walletAddress);

export const createRateLimitMiddleware = (limiter: RateLimiterRedis, keyGenerator: KeyGenerator = getIpKey) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    if (!key) {
      return next();
    }

    try {
      await limiter.consume(key.toLowerCase());

      return next();
    } catch {
      res.status(429).json({
        error: 'Too many requests. Please try again later'
      });
    }
  };
};
