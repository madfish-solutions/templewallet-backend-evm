import { Router } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';

import { createRateLimitMiddleware } from '../../rateLimiter';
import { redisClient } from '../../redis';
import { withCodedExceptionHandler } from '../../utils/express-helpers';

import { SUPPORTED_CHAINS } from './config';
import {
  prepareSchema,
  authorizationSchema,
  operationSchema,
  signedItemSchema,
  sendSchema,
  statusSchema
} from './schemas';
import { assertChain, getSubmissionSender, rpc } from './utils';

const limiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-alchemy-wallet',
  points: 60,
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
alchemyWalletRouter.use(createRateLimitMiddleware(limiter));
alchemyWalletRouter.get('/config', (_req, res) => {
  res.json({ chains: SUPPORTED_CHAINS });
});
alchemyWalletRouter.post(
  '/wallet_prepareCalls',
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
  createRateLimitMiddleware(submissionWalletLimiter, req => getSubmissionSender(req.body)),
  withCodedExceptionHandler(async (req, res) => {
    const { type } = await sendSchema.validate(req.body, { strict: true });
    const items: unknown[] = type === 'array' ? req.body.data : [req.body];
    if (!Array.isArray(items) || items.length < 1 || items.length > 2) {
      res.sendStatus(400);

      return;
    }
    const signed: Record<string, unknown>[] = [];
    for (const item of items) {
      const parsed = await signedItemSchema.validate(item, { strict: true });
      if (!SUPPORTED_CHAINS.includes(Number(BigInt(parsed.chainId)))) {
        res.sendStatus(400);

        return;
      }
      const data = await (parsed.type === 'authorization' ? authorizationSchema : operationSchema).validate(
        parsed.data,
        { strict: true }
      );
      signed.push({ ...parsed, data });
    }
    res.json(await rpc('wallet_sendPreparedCalls', type === 'array' ? { type, data: signed } : signed[0]));
  })
);
alchemyWalletRouter.post(
  '/wallet_getCallsStatus',
  withCodedExceptionHandler(async (req, res) => {
    const { callId } = await statusSchema.validate(req.body, { strict: true });
    res.json(await rpc('wallet_getCallsStatus', callId));
  })
);
