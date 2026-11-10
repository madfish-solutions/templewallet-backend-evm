import { Router } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';

import { createRateLimitMiddleware } from '../../rateLimiter';
import { redisClient } from '../../redis';
import { withCodedExceptionHandler } from '../../utils/express-helpers';

import { SUPPORTED_CHAINS } from './config';
import { prepareSchema, sendSchema, statusSchema } from './schemas';
import { assertChain, getSubmissionSender, rpc } from './utils';

const limiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-alchemy-wallet',
  points: 60,
  duration: 60
});
const statusLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-alchemy-wallet-status',
  points: 120,
  duration: 60
});
const walletLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-alchemy-wallet-account',
  points: 20,
  duration: 60
});
const submissionWalletLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-alchemy-wallet-submit-account',
  points: 10,
  duration: 60,
  blockDuration: 60
});

export const alchemyWalletRouter = Router();
alchemyWalletRouter.get('/config', createRateLimitMiddleware(limiter), (_req, res) => {
  res.json({ chains: SUPPORTED_CHAINS });
});
alchemyWalletRouter.post(
  '/wallet_prepareCalls',
  createRateLimitMiddleware(limiter),
  createRateLimitMiddleware(walletLimiter, req =>
    typeof req.body?.from === 'string' ? req.body.from.toLowerCase() : undefined
  ),
  withCodedExceptionHandler(async (req, res) => {
    const body = await prepareSchema.validate(req.body, { strict: true });
    assertChain(body.chainId);

    res.json(await rpc('wallet_prepareCalls', body));
  })
);
alchemyWalletRouter.post(
  '/wallet_sendPreparedCalls',
  createRateLimitMiddleware(limiter),
  createRateLimitMiddleware(submissionWalletLimiter, req => getSubmissionSender(req.body)),
  withCodedExceptionHandler(async (req, res) => {
    const body = await sendSchema.validate(req.body, { strict: true });
    const operation = body.type === 'array' ? body.data[1] : body;
    assertChain(operation.chainId);
    res.json(await rpc('wallet_sendPreparedCalls', body));
  })
);
alchemyWalletRouter.post(
  '/wallet_getCallsStatus',
  createRateLimitMiddleware(statusLimiter),
  withCodedExceptionHandler(async (req, res) => {
    const { callId } = await statusSchema.validate(req.body, { strict: true });
    res.json(await rpc('wallet_getCallsStatus', callId));
  })
);
