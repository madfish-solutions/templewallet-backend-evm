import {
  ChainType,
  ConnectionsRequest,
  convertQuoteToRoute,
  createConfig,
  getChains,
  getConnections,
  getQuote,
  getRoutes,
  getTokens,
  QuoteRequest,
  RoutesRequest,
  RoutesResponse,
  Token
} from '@lifi/sdk';
import retry from 'async-retry';

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

export const fetchAllSwapRoutes = (params: RoutesRequest) =>
  retry(async () => {
    try {
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
    } catch (err: any) {
      throw new CodedError(err?.cause?.status || 500, err?.message || 'LiFi routes error');
    }
  }, RETRY_OPTIONS);

export const fetchSwapRouteFromQuote = (params: QuoteRequest) =>
  retry(async () => {
    try {
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

      const route = convertQuoteToRoute(quote);

      return route;
    } catch (err: any) {
      throw new CodedError(err?.cause?.status || 500, err?.message || 'LiFi quote error');
    }
  }, RETRY_OPTIONS);

export const fetchSupportedSwapChainIds = () =>
  retry(async () => {
    try {
      const chainsMetadata = await getChains({ chainTypes: [ChainType.EVM] });

      return chainsMetadata.map(chain => chain.id);
    } catch (err: any) {
      throw new CodedError(err?.statusCode || 500, err?.message || 'LiFi chains metadata error');
    }
  }, RETRY_OPTIONS);

export const fetchConnectedDestinationTokens = (params: ConnectionsRequest) =>
  retry(async () => {
    try {
      const connectionsResponse = await getConnections({
        fromChain: params.fromChain,
        fromToken: params.fromToken,
        chainTypes: [ChainType.EVM]
      });

      const result: Record<number, Token[]> = {};

      for (const connection of connectionsResponse.connections) {
        for (const token of connection.toTokens) {
          if (!result[token.chainId]) {
            result[token.chainId] = [];
          }
          result[token.chainId].push(token);
        }
      }

      return result;
    } catch (err: any) {
      throw new CodedError(err?.statusCode || 500, err?.message || 'LiFi connections fetch error');
    }
  }, RETRY_OPTIONS);

export const fetchTokensMetadataByChains = (chainIds: number[]) =>
  retry(async () => {
    try {
      const response = await getTokens({ chains: chainIds });

      return response.tokens;
    } catch (err: any) {
      throw new CodedError(err?.statusCode || 500, err?.message || 'LiFi tokens fetch error');
    }
  }, RETRY_OPTIONS);
