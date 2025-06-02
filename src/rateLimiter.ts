import { NextFunction, Request, Response } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';

import { redisClient } from './redis';

export const covalentLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-covalent',
  points: 30,
  duration: 60,
  blockDuration: 60
});

export const txLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-transactions',
  points: 10,
  duration: 60,
  blockDuration: 60
});

export const createRateLimitMiddleware = (limiter: RateLimiterRedis) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip;

    try {
      await limiter.consume(ip!);

      return next();
    } catch {
      res.status(429).json({
        error: 'Too many requests. Please try again later, ip: ' + ip + '.'
      });
    }
  };
};
