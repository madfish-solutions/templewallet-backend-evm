import axios, { AxiosInstance } from 'axios';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { CodedError } from '../../utils/errors';

import { route3RedisClient } from './redis';

export const UPSTREAM_TIMEOUT_MS = 6000;
const RATE_LIMIT_WAIT_MS = 2000;

export interface RequestContext {
  signal?: AbortSignal;
}

export const createUpstreamApi = (baseURL: string, headers?: Record<string, string>): AxiosInstance => {
  const api = axios.create({ baseURL, headers, timeout: UPSTREAM_TIMEOUT_MS });
  api.interceptors.response.use(undefined, (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const code = error.code === 'ECONNABORTED' || error.code === 'ERR_CANCELED' ? 504 : 502;

      return Promise.reject(
        new CodedError(
          status === 404 || status === 429 || status === 400 ? status : code,
          'The upstream request failed. Retry later.'
        )
      );
    }

    return Promise.reject(new CodedError(502, 'The upstream request failed. Retry later.'));
  });

  return api;
};

export const withRateLimiter = <A extends unknown[], R>(
  limiter: RateLimiterRedis,
  fn: (...args: A) => Promise<R>
): ((...args: A) => Promise<R>) => {
  return async (...args: A): Promise<R> => {
    const startedAt = Date.now();
    for (;;) {
      try {
        await limiter.consume('backend');
        break;
      } catch (error) {
        if (!(error instanceof RateLimiterRes)) throw new CodedError(503, 'The request limiter is unavailable.');
        const remainingMs = RATE_LIMIT_WAIT_MS - (Date.now() - startedAt);
        if (remainingMs <= 0 || error.msBeforeNext > remainingMs)
          throw new CodedError(429, 'The request limit is reached. Retry later.');
        await new Promise(resolve => setTimeout(resolve, Math.max(error.msBeforeNext, 1)));
      }
    }

    return fn(...args);
  };
};

export const createRateLimiter = (keyPrefix: string, points: number, duration: number): RateLimiterRedis =>
  new RateLimiterRedis({
    storeClient: route3RedisClient,
    rejectIfRedisNotReady: true,
    keyPrefix,
    points,
    duration,
    blockDuration: Math.max(Math.ceil(duration / points), 1)
  });

export const isPrice = (price: unknown): price is string =>
  typeof price === 'string' &&
  /^(0|[1-9]\d*)(\.\d+)?$/.test(price) &&
  Number(price) > 0 &&
  Number.isFinite(Number(price));

export const fetchTokenPrices = async (
  addresses: string[],
  fetcher: (address: string) => Promise<Record<string, string>>,
  signal?: AbortSignal
): Promise<Record<string, string>> => {
  const prices: Record<string, string> = {};
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, addresses.length) }, async () => {
      while (cursor < addresses.length && !signal?.aborted) {
        const address = addresses[cursor++];
        try {
          Object.assign(prices, await fetcher(address));
        } catch {
          // Retain prices from the other token requests.
        }
      }
    })
  );

  return prices;
};
