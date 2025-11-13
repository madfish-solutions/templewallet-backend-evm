import { getAddress } from '@ethersproject/address';
import axios from 'axios';
import Big from 'big.js';
import memoizee from 'memoizee';

import { EnvVars } from '../../config';

import { getEtherlinkExchangeRates, getXtzPrice } from './etherlink';
import { getGeckoterminalExchangeRates } from './geckoterminal';
import { createRateLimiter, withRateLimiter } from './utils';

interface Route3EvmSwapRequest {
  fee?: number;
  referrer?: string;
  amount: number;
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

async function get3RouteEvmTokenPrices(tokens: Route3EvmTokens['tokens']): Promise<Record<string, string>> {
  const tokensAddresses = Object.keys(tokens).filter(address => address !== xtzAddress);

  const [xtzPrice, etherlinkExchangeRates, geckoterminalExchangeRates] = await Promise.all([
    getXtzPrice(),
    getEtherlinkExchangeRates(tokensAddresses),
    getGeckoterminalExchangeRates(tokensAddresses)
  ]);

  return {
    ...geckoterminalExchangeRates,
    ...etherlinkExchangeRates,
    [xtzAddress]: xtzPrice
  };
}

const route3Api = axios.create({
  baseURL: 'https://temple-evm.3route.io',
  headers: { Authorization: `Bearer ${EnvVars.ROUTE3_EVM_API_KEY}` }
});

const route3ApiRateLimiter = createRateLimiter('rl-route3-api', 10, 1);

const fetchRawEvmTokens = withRateLimiter(route3ApiRateLimiter, async () => {
  const { data } = await route3Api.get<Route3EvmTokens>('/api/v6.1/42793/tokens');

  return data;
});

export const get3RouteEvmTokensWithPrices = memoizee(
  async () => {
    const { tokens } = await fetchRawEvmTokens();

    const prices = await get3RouteEvmTokenPrices(tokens);

    return Object.fromEntries(
      Object.entries(tokens).map(([address, token]) => [
        getAddress(address),
        { ...token, address: getAddress(token.address), logoURI: token.logoURI || undefined, priceUSD: prices[address] }
      ])
    );
  },
  { promise: true, maxAge: 20000 }
);

const fetchRawEvmSwap = withRateLimiter(route3ApiRateLimiter, async (params: Route3EvmSwapRequest) => {
  const { data } = await route3Api.get<Route3EvmSwapResponse>('/api/v6.1/42793/swap', {
    params: { ...params, includeProtocols: true }
  });

  return data;
});

const getAmountUSD = (amount: string, decimals: number, priceUSD: string | undefined) =>
  priceUSD ? new Big(amount).div(new Big(10).pow(decimals)).mul(priceUSD).round(2, Big.roundDown).toFixed() : '0.00';

export const get3RouteEvmSwap = withRateLimiter(route3ApiRateLimiter, async (params: Route3EvmSwapRequest) => {
  const [{ srcAmount, dstAmount, tx, protocols }, tokensWithPrices] = await Promise.all([
    fetchRawEvmSwap(params),
    get3RouteEvmTokensWithPrices()
  ]);
  const { to: txDestination, data, gas, gasPrice } = tx;
  const fromToken = tokensWithPrices[getAddress(params.src)];
  const toToken = tokensWithPrices[getAddress(params.dst)];

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
});
