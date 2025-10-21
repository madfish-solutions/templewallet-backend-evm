import { Router, Response } from 'express';

import { covalentLimiter, createRateLimitMiddleware, txLimiter } from '../rateLimiter';
import { withCodedExceptionHandler } from '../utils/express-helpers';
import {
  evmMultichainQueryParamsSchema,
  evmQueryParamsSchema,
  evmQueryParamsTransactionsSchema,
  swapConnectionsQuerySchema,
  swapRouteQuerySchema,
  swapTokensQuerySchema,
  lifiStatusQuerySchema
} from '../utils/schemas';

import { fetchTransactions } from './alchemy';
import { getEvmAccountActivity, getEvmBalances, getEvmCollectiblesMetadata, getEvmTokensMetadata } from './covalent';
import {
  fetchAllSwapRoutes,
  fetchSupportedSwapChainIds,
  fetchConnectedDestinationTokens,
  fetchSwapRouteFromQuote,
  fetchTokensMetadataByChains,
  fetchStepTransaction,
  fetchSwapStatus
} from './lifi';

export const apiRouter = Router();

const sendData = (data: any, res: Response<any, Record<string, any>>) => {
  try {
    res.status(200).json(JSON.parse(data));
  } catch {
    res.status(200).send(data);
  }
};

apiRouter
  .get(
    '/balances',
    createRateLimitMiddleware(covalentLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, chainId } = await evmQueryParamsSchema.validate(req.query);

      sendData(await getEvmBalances(walletAddress, chainId), res);
    })
  )
  .get(
    '/tokens-metadata',
    createRateLimitMiddleware(covalentLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, chainId } = await evmQueryParamsSchema.validate(req.query);

      sendData(await getEvmTokensMetadata(walletAddress, chainId), res);
    })
  )
  .get(
    '/swap-routes',
    withCodedExceptionHandler(async (req, res) => {
      const { fromChain, toChain, fromToken, toToken, amount, amountForGas, fromAddress, slippage } =
        await swapRouteQuerySchema.validate(req.query);

      const data = await fetchAllSwapRoutes({
        fromChainId: Number(fromChain),
        fromAmount: amount,
        fromTokenAddress: fromToken,
        fromAddress,
        toChainId: Number(toChain),
        toTokenAddress: toToken,
        fromAmountForGas: amountForGas,
        options: {
          slippage: Number(slippage)
        }
      });

      res.status(200).send(data);
    })
  )
  .get(
    '/swap-route',
    withCodedExceptionHandler(async (req, res) => {
      const { fromChain, toChain, fromToken, toToken, amount, amountForGas, fromAddress, slippage } =
        await swapRouteQuerySchema.validate(req.query);

      const data = await fetchSwapRouteFromQuote({
        fromChain: Number(fromChain),
        toChain: Number(toChain),
        fromToken,
        toToken,
        fromAmount: amount,
        fromAmountForGas: amountForGas,
        fromAddress,
        slippage: Number(slippage)
      });

      res.status(200).send(data);
    })
  )
  .get(
    '/swap-chains',
    withCodedExceptionHandler(async (req, res) => {
      const data = await fetchSupportedSwapChainIds();

      res.status(200).send(data);
    })
  )
  .get(
    '/swap-tokens',
    withCodedExceptionHandler(async (req, res) => {
      const { chainIds } = await swapTokensQuerySchema.validate(req.query);

      const numericChainIds = chainIds.split(',').map((id: string) => Number(id));

      const data = await fetchTokensMetadataByChains(numericChainIds);

      res.status(200).send(data);
    })
  )
  .get(
    '/swap-connections',
    withCodedExceptionHandler(async (req, res) => {
      const { fromChain, fromToken } = await swapConnectionsQuerySchema.validate(req.query);

      const data = await fetchConnectedDestinationTokens({ fromChain: Number(fromChain), fromToken });

      res.status(200).send(data);
    })
  )
  .post(
    '/swap-step-transaction',
    withCodedExceptionHandler(async (req, res) => {
      const data = await fetchStepTransaction(req.body);

      res.status(200).send(data);
    })
  )
  .get(
    '/swap-status',
    withCodedExceptionHandler(async (req, res) => {
      const { txHash, bridge, fromChain, toChain } = await lifiStatusQuerySchema.validate(req.query);

      const data = await fetchSwapStatus({ txHash, bridge, fromChain, toChain });

      res.status(200).send(data);
    })
  )
  .get(
    '/collectibles-metadata',
    createRateLimitMiddleware(covalentLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, chainId } = await evmQueryParamsSchema.validate(req.query);

      sendData(await getEvmCollectiblesMetadata(walletAddress, chainId), res);
    })
  )
  .get(
    '/is-initialized',
    createRateLimitMiddleware(covalentLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress } = await evmMultichainQueryParamsSchema.validate(req.query);
      const { items: activityItems } = await getEvmAccountActivity(walletAddress);
      res.status(200).json({ isInitialized: (activityItems ?? []).length > 0 });
    })
  )
  .get(
    '/transactions/v2',
    createRateLimitMiddleware(txLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, chainId, contractAddress, olderThanBlockHeight } =
        await evmQueryParamsTransactionsSchema.validate(req.query);

      sendData(
        await fetchTransactions(
          chainId,
          walletAddress,
          contractAddress,
          olderThanBlockHeight as `${number}` | undefined
        ),
        res
      );
    })
  );
