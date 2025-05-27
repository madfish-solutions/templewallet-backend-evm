import { convertQuoteToRoute, createConfig, getConnections, getQuote, getTokens } from '@lifi/sdk';
import retry from 'async-retry';

import { CodedError } from '../utils/errors';

createConfig({
  integrator: 'temple-wallet',
  apiKey: '',
  routeOptions: {
    fee: 0.0035, // 0.35% + 0.25% lifi = 0.6%
    maxPriceImpact: 0.01, // 1%
    order: 'CHEAPEST',
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
        slippage: params.slippage
      });

      const route = convertQuoteToRoute(quote);

      return route;
    } catch (err: any) {
      throw new CodedError(err?.statusCode || 500, err?.message || 'LiFi quote error');
    }
  }, RETRY_OPTIONS);

export const getSwapConnectionsRoute = (params: SwapConnectionParams) =>
  retry(async () => {
    try {
      const connectionsResponse = await getConnections({
        fromChain: params.fromChain,
        fromToken: params.fromToken
      });

      return connectionsResponse.connections[0].toTokens;
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
