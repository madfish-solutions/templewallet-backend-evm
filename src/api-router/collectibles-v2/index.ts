import { Router } from 'express';

import { sendData, withCodedExceptionHandler } from '../../utils/express-helpers.js';
import { createMixedRateLimitMiddleware } from '../../utils/rate-limiting.js';
import { fetchEvmCollectibles, fetchEvmCollectiblesContracts } from '../alchemy/index.js';

import {
  alchemyCollectiblesLimiter,
  alchemyCollectiblesWalletLimiter,
  openseaCacheLimiter,
  openseaCacheWalletLimiter,
  openseaLimiter,
  openseaWalletLimiter
} from './limiters.js';
import {
  getAccountNfts as getOpenseaAccountNfts,
  getNftsByRefs,
  getCachedNftsByRefs,
  getAccountCollections as getOpenseaAccountCollections,
  getOpenseaSearch
} from './opensea.js';
import {
  alchemyOwnerContractsQueryParamsSchema,
  alchemyOwnerNftsQueryParamsSchema,
  openseaAccountNftsQueryParamsSchema,
  openseaCollectiblesByRefsBodySchema,
  openseaCachedCollectiblesByRefsBodySchema,
  openseaAccountCollectionsQueryParamsSchema,
  openseaSearchQueryParamsSchema
} from './schemas.js';

export const collectiblesV2Router = Router();

collectiblesV2Router
  .post(
    '/opensea/by-refs/cached',
    createMixedRateLimitMiddleware(openseaCacheLimiter, openseaCacheWalletLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const input = await openseaCachedCollectiblesByRefsBodySchema.validate(req.body);

      sendData(await getCachedNftsByRefs(input), res);
    })
  )
  .post(
    '/opensea/by-refs',
    createMixedRateLimitMiddleware(openseaLimiter, openseaWalletLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const input = await openseaCollectiblesByRefsBodySchema.validate(req.body);

      sendData(await getNftsByRefs(input), res);
    })
  )
  .get(
    '/opensea/by-account',
    createMixedRateLimitMiddleware(openseaLimiter, openseaWalletLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { chainId, walletAddress, collection, next } = await openseaAccountNftsQueryParamsSchema.validate(
        req.query
      );

      sendData(await getOpenseaAccountNfts(walletAddress, chainId, collection, next), res);
    })
  )
  .get(
    '/opensea/account-collections',
    createMixedRateLimitMiddleware(openseaLimiter, openseaWalletLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, chainIds, limit, after } = await openseaAccountCollectionsQueryParamsSchema.validate(
        req.query
      );

      sendData(await getOpenseaAccountCollections(walletAddress, chainIds, limit, after), res);
    })
  )
  .get(
    '/opensea/search',
    createMixedRateLimitMiddleware(openseaLimiter, openseaWalletLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { query, chainIds, limit, assetTypes } = await openseaSearchQueryParamsSchema.validate(req.query);

      sendData(await getOpenseaSearch(query, assetTypes ?? ['collection', 'nft'], chainIds, limit), res);
    })
  )
  .get(
    '/alchemy/owner-contracts',
    createMixedRateLimitMiddleware(alchemyCollectiblesLimiter, alchemyCollectiblesWalletLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, ...rest } = await alchemyOwnerContractsQueryParamsSchema.validate(req.query);

      sendData(await fetchEvmCollectiblesContracts({ accAddress: walletAddress, ...rest }), res);
    })
  )
  .get(
    '/alchemy/owner-nfts',
    createMixedRateLimitMiddleware(alchemyCollectiblesLimiter, alchemyCollectiblesWalletLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, ...rest } = await alchemyOwnerNftsQueryParamsSchema.validate(req.query);

      sendData(await fetchEvmCollectibles({ accAddress: walletAddress, ...rest }), res);
    })
  );
