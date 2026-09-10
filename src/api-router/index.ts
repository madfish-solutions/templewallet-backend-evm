import { Router, Response } from 'express';

import {
  alchemyPrepareCallsLimiter,
  alchemyPrepareCallsWalletLimiter,
  covalentLimiter,
  covalentWalletLimiter,
  createRateLimitMiddleware,
  everstakeLimiter,
  initializedLimiter,
  initializedWalletLimiter,
  lifiLimiter,
  txLimiter,
  txWalletLimiter,
  walletAddressKeyGenerator
} from '../rateLimiter';
import { withCodedExceptionHandler } from '../utils/express-helpers';
import {
  evmMultichainQueryParamsSchema,
  evmQueryParamsSchema,
  evmQueryParamsTransactionsSchema,
  swapConnectionsQuerySchema,
  swapRouteQuerySchema,
  swapTokensQuerySchema,
  lifiStatusQuerySchema,
  route3SwapQuerySchema
} from '../utils/schemas';

import { get3RouteEvmSwap, get3RouteEvmTokensWithPrices } from './3route-evm';
import { fetchLastTransferTimestamp, fetchTransactions } from './alchemy';
import {
  getAlchemyWalletRateLimitKey,
  proxyWalletGetCallsStatus,
  proxyWalletPrepareCalls,
  proxyWalletSendPreparedCalls
} from './alchemy-wallet';
import { getEvmAccountActivity, getEvmBalances, getEvmCollectiblesMetadata, getEvmTokensMetadata } from './covalent';
import { everstakeDashboardRequestsProxy, everstakeEthRequestsProxy, everstakeWalletRequestsProxy } from './everstake';
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
    createRateLimitMiddleware(covalentWalletLimiter, walletAddressKeyGenerator),
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, chainId } = await evmQueryParamsSchema.validate(req.query);

      sendData(await getEvmBalances(walletAddress, chainId), res);
    })
  )
  .get(
    '/tokens-metadata',
    createRateLimitMiddleware(covalentLimiter),
    createRateLimitMiddleware(covalentWalletLimiter, walletAddressKeyGenerator),
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, chainId } = await evmQueryParamsSchema.validate(req.query);

      sendData(await getEvmTokensMetadata(walletAddress, chainId), res);
    })
  )
  .get(
    '/collectibles-metadata',
    createRateLimitMiddleware(covalentLimiter),
    createRateLimitMiddleware(covalentWalletLimiter, walletAddressKeyGenerator),
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, chainId } = await evmQueryParamsSchema.validate(req.query);

      sendData(await getEvmCollectiblesMetadata(walletAddress, chainId), res);
    })
  )
  .get(
    '/is-initialized',
    createRateLimitMiddleware(initializedLimiter),
    createRateLimitMiddleware(initializedWalletLimiter, walletAddressKeyGenerator),
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress } = await evmMultichainQueryParamsSchema.validate(req.query);
      const { items: activityItems } = await getEvmAccountActivity(walletAddress);

      if ((activityItems ?? []).length > 0) {
        res.status(200).json({ isInitialized: true });

        return;
      }

      const rootstockNetsLastTransferTimestamps = await Promise.all(
        [30, 31].map(chainId => fetchLastTransferTimestamp(chainId, walletAddress))
      );
      res.status(200).json({ isInitialized: rootstockNetsLastTransferTimestamps.some(Boolean) });
    })
  )
  .get(
    '/transactions/v2',
    createRateLimitMiddleware(txLimiter),
    createRateLimitMiddleware(txWalletLimiter, walletAddressKeyGenerator),
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
  )
  .get(
    '/swap-routes',
    createRateLimitMiddleware(lifiLimiter),
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
    createRateLimitMiddleware(lifiLimiter),
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
    createRateLimitMiddleware(lifiLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const data = await fetchSupportedSwapChainIds();

      res.status(200).send(data);
    })
  )
  .get(
    '/swap-tokens',
    createRateLimitMiddleware(lifiLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { chainIds } = await swapTokensQuerySchema.validate(req.query);

      const numericChainIds = chainIds?.split(',').map((id: string) => Number(id));

      const data = await fetchTokensMetadataByChains(numericChainIds);

      res.status(200).send(data);
    })
  )
  .get(
    '/swap-connections',
    createRateLimitMiddleware(lifiLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { fromChain, fromToken } = await swapConnectionsQuerySchema.validate(req.query);

      const data = await fetchConnectedDestinationTokens({ fromChain: Number(fromChain), fromToken });

      res.status(200).send(data);
    })
  )
  .post(
    '/alchemy/wallet_prepareCalls',
    createRateLimitMiddleware(alchemyPrepareCallsLimiter),
    createRateLimitMiddleware(alchemyPrepareCallsWalletLimiter, req => getAlchemyWalletRateLimitKey(req.body)),
    withCodedExceptionHandler(async (req, res) => {
      res.status(200).send(await proxyWalletPrepareCalls(req.body));
    })
  )
  .post(
    '/alchemy/wallet_sendPreparedCalls',
    createRateLimitMiddleware(alchemyPrepareCallsLimiter),
    createRateLimitMiddleware(alchemyPrepareCallsWalletLimiter, req => getAlchemyWalletRateLimitKey(req.body)),
    withCodedExceptionHandler(async (req, res) => {
      res.status(200).send(await proxyWalletSendPreparedCalls(req.body));
    })
  )
  .post(
    '/alchemy/wallet_getCallsStatus',
    createRateLimitMiddleware(alchemyPrepareCallsLimiter),
    withCodedExceptionHandler(async (req, res) => {
      res.status(200).send(await proxyWalletGetCallsStatus(req.body));
    })
  )
  .post(
    '/swap-step-transaction',
    createRateLimitMiddleware(lifiLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const data = await fetchStepTransaction(req.body);

      res.status(200).send(data);
    })
  )
  .get(
    '/swap-status',
    createRateLimitMiddleware(lifiLimiter),
    withCodedExceptionHandler(async (req, res) => {
      const { txHash, bridge, fromChain, toChain } = await lifiStatusQuerySchema.validate(req.query);

      const data = await fetchSwapStatus({ txHash, bridge, fromChain, toChain });

      res.status(200).send(data);
    })
  )
  .use('/everstake-wallet', createRateLimitMiddleware(everstakeLimiter), everstakeWalletRequestsProxy)
  .use('/everstake-dashboard', createRateLimitMiddleware(everstakeLimiter), everstakeDashboardRequestsProxy)
  .use('/everstake-eth-api', createRateLimitMiddleware(everstakeLimiter), everstakeEthRequestsProxy)
  .get('/3route-tokens', async (_req, res) => {
    sendData(await get3RouteEvmTokensWithPrices(), res);
  })
  .get('/3route-swap', async (req, res) => {
    const { src, dst, amount, from, slippage, referrer, fee } = await route3SwapQuerySchema.validate(req.query);

    sendData(await get3RouteEvmSwap({ src, dst, amount, from, slippage, referrer, fee }), res);
  });
