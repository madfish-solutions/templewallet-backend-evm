import { NextFunction, Request, Response } from 'express';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { redisClient } from '../redis.js';

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

const makeRateLimitConsumer =
  <T extends unknown[], U = void>(
    limiter: RateLimiterRedis,
    keyGenerator: (...args: T) => string | undefined,
    onConsumed: (...args: T) => U | Promise<U>,
    onRateLimited: (retryAfterMs: number, ...args: T) => U | Promise<U>
  ) =>
  async (...args: T) => {
    const key = keyGenerator(...args);

    if (!key) {
      return await onConsumed(...args);
    }

    try {
      await limiter.consume(key.toLowerCase());

      return await onConsumed(...args);
    } catch (e) {
      if (e instanceof RateLimiterRes) {
        return await onRateLimited(e.msBeforeNext, ...args);
      }

      throw e;
    }
  };

export class AbortedError extends Error {
  public readonly isTimeout: boolean;

  constructor(signal?: AbortSignal) {
    super('Aborted');
    this.isTimeout = signal?.reason?.name === 'TimeoutError';
  }
}

export const withRateLimitWaiting = <A extends unknown[], R>(
  limiter: RateLimiterRedis,
  fn: (...args: A) => Promise<R>,
  getAbortSignal: (...args: A) => AbortSignal | undefined = () => undefined
) => {
  return async (...args: A) => {
    let consumed = false;
    const abortSignal = getAbortSignal(...args);
    while (!consumed) {
      if (abortSignal?.aborted) {
        throw new AbortedError(abortSignal);
      }

      try {
        await limiter.consume('backend');
        consumed = true;
      } catch (e) {
        if (abortSignal?.aborted) {
          throw new AbortedError(abortSignal);
        }

        if (e instanceof RateLimiterRes && abortSignal) {
          let onAbort: () => void;
          let stopWaiting: () => void;
          const waitForAbortionPromise = new Promise<void>((resolve, reject) => {
            onAbort = () => reject(new AbortedError(abortSignal));
            stopWaiting = () => {
              abortSignal.removeEventListener('abort', onAbort);
              resolve();
            };
            abortSignal.addEventListener('abort', () => onAbort());
          });
          await Promise.race([
            new Promise<void>(resolve =>
              setTimeout(() => {
                stopWaiting();
                resolve();
              }, e.msBeforeNext)
            ),
            waitForAbortionPromise
          ]);
        } else if (e instanceof RateLimiterRes) {
          await new Promise(resolve => setTimeout(resolve, e.msBeforeNext));
        } else {
          throw e;
        }
      }
    }

    return fn(...args);
  };
};

export const createRateLimitMiddleware = (
  limiter: RateLimiterRedis,
  keyGenerator: KeyGenerator = getIpKey,
  onSuccess: (req: Request, res: Response, next: NextFunction) => void = (_, _2, next) => next()
) =>
  makeRateLimitConsumer<[Request, Response, NextFunction]>(limiter, keyGenerator, onSuccess, (retryAfterMs, _, res) => {
    res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
    res.status(429).json({
      error: 'Too many requests. Please try again later'
    });
  });

export const createMixedRateLimitMiddleware = (ipRateLimiter: RateLimiterRedis, walletRateLimiter: RateLimiterRedis) =>
  createRateLimitMiddleware(
    ipRateLimiter,
    getIpKey,
    createRateLimitMiddleware(walletRateLimiter, walletAddressKeyGenerator)
  );
