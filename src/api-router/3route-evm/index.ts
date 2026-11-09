import { getAddress } from '@ethersproject/address';
import Big from 'big.js';

import { EnvVars } from '../../config';
import { CodedError } from '../../utils/errors';

import { createSharedCache } from './cache';
import { getEtherlinkExchangeRates, getXtzPrice } from './etherlink';
import { getGeckoterminalExchangeRates } from './geckoterminal';
import { route3RedisClient } from './redis';
import { createRateLimiter, createUpstreamApi, withRateLimiter } from './utils';

interface Route3EvmSwapRequest {
  fee?: number;
  referrer?: string;
  amount: string;
  slippage: number;
  src: string;
  dst: string;
  from: string;
}

interface Route3EvmSwapFragment {
  token: string;
  hops: Route3EvmHop[];
}

interface Route3EvmSwapProtocolEntry {
  name: string;
  part: number;
}

interface Route3EvmHop {
  part: number;
  dst: string;
  fromTokenId: number;
  toTokenId: number;
  protocols: Route3EvmSwapProtocolEntry[];
}

interface Route3EvmSwapResponse {
  tx: Record<'from' | 'to' | 'data' | 'value' | 'gas' | 'gasPrice', string>;
  dstAmount: string;
  srcAmount: string;
  gas: number;
  protocols: Route3EvmSwapFragment[];
}

interface Route3EvmTokens {
  tokens: Record<
    string,
    {
      address: string;
      symbol: string;
      name: string;
      decimals: number;
      logoURI: string;
    }
  >;
}

const xtzAddress = '0x0000000000000000000000000000000000000000';

const route3Api = createUpstreamApi('https://temple-evm.3route.io', {
  Authorization: `Bearer ${EnvVars.ROUTE3_EVM_API_KEY}`
});

const route3ApiRateLimiter = createRateLimiter('rl-route3-api', 10, 1);

const fetchRawEvmTokens = withRateLimiter(route3ApiRateLimiter, async () => {
  const { data } = await route3Api.get<Route3EvmTokens>('/api/v6.1/42793/tokens');

  return data;
});

const tokenCache = createSharedCache({
  store: route3RedisClient,
  key: 'cache:3route:42793:tokens:v1',
  freshMs: 60 * 60_000,
  retainMs: 24 * 60 * 60_000,
  fetcher: fetchRawEvmTokens
});

const priceCache = createSharedCache({
  store: route3RedisClient,
  key: 'cache:3route:42793:prices:v1',
  freshMs: 60_000,
  retainMs: 10 * 60_000,
  fetcher: async (): Promise<Record<string, string>> => {
    const { tokens } = await tokenCache.get();
    const addresses = Object.keys(tokens)
      .map(address => address.toLowerCase())
      .filter(address => address !== xtzAddress);
    const context = { signal: AbortSignal.timeout(20_000) };
    const [xtzResult, etherlinkResult] = await Promise.allSettled([
      getXtzPrice(context),
      getEtherlinkExchangeRates(addresses, context)
    ]);
    const etherlinkPrices = etherlinkResult.status === 'fulfilled' ? etherlinkResult.value : {};
    const missing = addresses.filter(address => !etherlinkPrices[address]);
    const geckoPrices = await getGeckoterminalExchangeRates(missing, context);
    const prices: Record<string, string> = { ...geckoPrices, ...etherlinkPrices };
    if (xtzResult.status === 'fulfilled' && xtzResult.value) prices[xtzAddress] = xtzResult.value;
    if (Object.keys(prices).length === 0) throw new Error('Token prices are unavailable.');

    return prices;
  }
});

export const get3RouteEvmTokensWithPrices = async () => {
  const [{ tokens }, prices = {}] = await Promise.all([tokenCache.get(), priceCache.getOptional()]);

  return Object.fromEntries(
    Object.entries(tokens).map(([address, token]) => [
      getAddress(address),
      {
        ...token,
        address: getAddress(token.address),
        logoURI: token.logoURI || undefined,
        priceUSD: prices[address.toLowerCase()]
      }
    ])
  );
};

const fetchRawEvmSwap = withRateLimiter(route3ApiRateLimiter, async (params: Route3EvmSwapRequest) => {
  const { data } = await route3Api.get<Route3EvmSwapResponse>('/api/v6.1/42793/swap', {
    params: {
      ...params,
      includeProtocols: true,
      // stXTZ/WXTZ Curve pool (0x74d80ee400d3026fdd2520265cc98300710b25d4) stale oracle causes swaps to revert.
      // Failed swap example: https://explorer.etherlink.com/tx/0x84398066b3036a25d50e2f01e672730cea2449b6581f8c5f712895fb36f70667
      excludedProtocols: 'CurveFi/Stable'
    }
  });

  return data;
});

const getAmountUSD = (amount: string, decimals: number, priceUSD: string | undefined) =>
  priceUSD ? new Big(amount).div(new Big(10).pow(decimals)).mul(priceUSD).round(2, Big.roundDown).toFixed() : '0.00';

export const get3RouteEvmSwap = async (params: Route3EvmSwapRequest) => {
  const [{ srcAmount, dstAmount, tx, protocols }, tokensWithPrices] = await Promise.all([
    fetchRawEvmSwap(params),
    get3RouteEvmTokensWithPrices()
  ]);
  const { to: txDestination, data, gas, gasPrice } = tx;
  const fromToken = tokensWithPrices[getAddress(params.src)];
  const toToken = tokensWithPrices[getAddress(params.dst)];

  if (!fromToken || !toToken) throw new CodedError(400, 'The selected token is unavailable.');

  return {
    fromAmount: srcAmount,
    fromAmountUSD: getAmountUSD(srcAmount, fromToken.decimals, fromToken.priceUSD),
    toAmount: dstAmount,
    toAmountUSD: getAmountUSD(dstAmount, toToken.decimals, toToken.priceUSD),
    fromAddress: params.from,
    txDestination,
    txData: data,
    gas,
    gasPrice,
    toAmountMin: new Big(dstAmount).mul(new Big(100).minus(params.slippage)).div(100).round(0, Big.roundDown).toFixed(),
    fromToken,
    toToken,
    stepsCount: protocols.reduce((sum, { hops }) => sum + hops.length, 0)
  };
};
