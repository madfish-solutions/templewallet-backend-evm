import {
  ChainType,
  convertQuoteToRoute,
  createConfig,
  getChains,
  getConnections,
  getQuote,
  getTokens,
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

type SwapRouteParams = {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  amount: string;
  fromAddress: string;
  slippage: number;
  amountForGas?: string;
};

type SwapConnectionParams = {
  fromChain: number;
  fromToken: string;
};

export const getSwapRoute = (params: SwapRouteParams) =>
  retry(async () => {
    try {
      const quote = await getQuote({
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromAmount: params.amount,
        fromAddress: params.fromAddress,
        slippage: params.slippage,
        fromAmountForGas: params.amountForGas,
        skipSimulation: false
      });

      const route = convertQuoteToRoute(quote);

      return route;
    } catch (err: any) {
      throw new CodedError(err?.statusCode || 500, err?.message || 'LiFi quote error');
    }
  }, RETRY_OPTIONS);

export const getSwapChains = () =>
  retry(async () => {
    try {
      const chainsMetadata = await getChains({ chainTypes: [ChainType.EVM] });

      return chainsMetadata.map(chain => chain.id);
    } catch (err: any) {
      throw new CodedError(err?.statusCode || 500, err?.message || 'LiFi chains metadata error');
    }
  }, RETRY_OPTIONS);

export const getSwapConnectionsRoute = (params: SwapConnectionParams) =>
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

export const getSwapTokensMetadata = (chainIds: number[]) =>
  retry(async () => {
    try {
      const response = await getTokens({ chains: chainIds });

      return response.tokens;
    } catch (err: any) {
      throw new CodedError(err?.statusCode || 500, err?.message || 'LiFi tokens fetch error');
    }
  }, RETRY_OPTIONS);
