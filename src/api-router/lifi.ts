import {
  ChainType,
  ConnectionsRequest,
  convertQuoteToRoute,
  createConfig,
  getChains,
  getQuote,
  getRoutes,
  getStatus,
  GetStatusRequest,
  getStepTransaction,
  getTokens,
  type LiFiStep,
  QuoteRequest,
  RoutesRequest,
  RoutesResponse,
  type SignedLiFiStep
} from '@lifi/sdk';
import retry from 'async-retry';
import memoizee from 'memoizee';

import { EnvVars } from '../config';
import { CodedError } from '../utils/errors';

createConfig({
  integrator: 'temple',
  apiKey: EnvVars.LIFI_API_KEY,
  routeOptions: {
    fee: 0.0035, // 0.35% + 0.25% lifi = 0.6%
    maxPriceImpact: 0.01, // 1%
    order: 'RECOMMENDED',
    allowSwitchChain: true,
    allowDestinationCall: true
  }
});

const RETRY_OPTIONS: retry.Options = { maxRetryTime: 5_000 };

const withRetry =
  <T extends unknown[], U>(fn: (...args: T) => Promise<U>, transformError: (error: any) => CodedError) =>
  (...args: T) =>
    retry(async () => {
      try {
        return await fn(...args);
      } catch (err: any) {
        throw transformError(err);
      }
    }, RETRY_OPTIONS);

const withMemoizee = <T extends (...args: any[]) => Promise<unknown>>(fn: T, options: memoizee.Options<T> = {}) =>
  memoizee(fn, { promise: true, maxAge: 300_000, ...options });

export const fetchAllSwapRoutes = withRetry(
  async (params: RoutesRequest) => {
    const routesResponse: RoutesResponse = await getRoutes({
      fromChainId: params.fromChainId,
      fromAmount: params.fromAmount,
      fromTokenAddress: params.fromTokenAddress,
      fromAddress: params.fromAddress,
      toChainId: params.toChainId,
      toTokenAddress: params.toTokenAddress,
      fromAmountForGas: params.fromAmountForGas,
      options: params.options
    });

    return routesResponse;
  },
  err => new CodedError(err?.cause?.status || err?.statusCode || 500, err?.message || 'LiFi routes error')
);

export const fetchSwapRouteFromQuote = withRetry(
  async (params: QuoteRequest) => {
    const quote = await getQuote({
      fromChain: params.fromChain,
      toChain: params.toChain,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      fromAmountForGas: params.fromAmountForGas,
      slippage: params.slippage,
      skipSimulation: false
    });

    return convertQuoteToRoute(quote);
  },
  err => new CodedError(err?.cause?.status || err?.statusCode || 500, err?.message || 'LiFi quote error')
);

export const fetchSupportedSwapChainIds = withMemoizee(
  withRetry(
    async () => {
      const chainsMetadata = await getChains({ chainTypes: [ChainType.EVM] });

      return chainsMetadata.map(chain => chain.id);
    },
    err => new CodedError(err?.cause?.status || err?.statusCode || 500, err?.message || 'LiFi chains metadata error')
  )
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const fetchConnectedDestinationTokens = async (_params: ConnectionsRequest) => fetchEvmTokensMetadata();

const fetchEvmTokensMetadata = withMemoizee(
  withRetry(
    async () => {
      const response = await getTokens({ chainTypes: [ChainType.EVM] });

      return response.tokens;
    },
    err => new CodedError(err?.cause?.status || err?.statusCode || 500, err?.message || 'LiFi tokens fetch error')
  )
);

export const fetchTokensMetadataByChains = withMemoizee(
  async (chainIds?: number[]) => {
    const allTokens = await fetchEvmTokensMetadata();

    return chainIds ? Object.fromEntries(chainIds.map(chainId => [chainId, allTokens[chainId] ?? []])) : allTokens;
  },
  { normalizer: args => args[0]?.join(',') ?? '', max: 1_000 }
);

export const fetchStepTransaction = withRetry(
  (step: LiFiStep | SignedLiFiStep) => getStepTransaction(step),
  err => new CodedError(err?.cause?.status || err?.statusCode || 500, err?.message || 'LiFi step transaction error')
);

export const fetchSwapStatus = withRetry(
  (params: GetStatusRequest) => getStatus(params),
  err => new CodedError(err?.cause?.status || err?.statusCode || 500, err?.message || 'LiFi tx status error')
);
