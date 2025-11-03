import axios from 'axios';
import memoizee from 'memoizee';

import { EnvVars } from '../../config';

import { getTokensPage, getXtzPrice, PageParams } from './etherlink';
import { GeckoterminalToken, getPoolsPage } from './geckoterminal';

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

async function getEtherlinkExchangeRates(tokensAddresses: string[]) {
  const tokensAddressesSet = new Set(tokensAddresses);
  const exchangeRates: Record<string, string> = {};
  let pageParams: PageParams | null = null;
  do {
    const { next_page_params, items } = await getTokensPage(pageParams);
    pageParams = next_page_params;
    items.forEach(item => {
      if (tokensAddressesSet.has(item.address_hash.toLowerCase())) {
        if (item.exchange_rate != null) {
          exchangeRates[item.address_hash.toLowerCase()] = item.exchange_rate;
        }
        tokensAddressesSet.delete(item.address_hash.toLowerCase());
      }
    });
  } while (pageParams != null && tokensAddressesSet.size > 0);

  return exchangeRates;
}

async function getGeckoterminalExchangeRates(tokensAddresses: string[]) {
  const tokensAddressesSet = new Set(tokensAddresses);
  const exchangeRates: Record<string, string> = {};
  let responseWasEmpty = false;
  let pageNumber = 1;
  do {
    const { data, included } = await getPoolsPage(pageNumber);
    const includedEntitiesById = Object.fromEntries(included.map(entity => [entity.id, entity]));
    responseWasEmpty = data.length === 0;
    data.forEach(({ attributes, relationships }) => {
      const { base_token_price_usd, quote_token_price_usd } = attributes;
      const { base_token, quote_token } = relationships;
      const tokensIds = [base_token.data.id, quote_token.data.id];
      const prices = [base_token_price_usd, quote_token_price_usd];
      tokensIds.forEach((tokenId, index) => {
        const token = includedEntitiesById[tokenId] as GeckoterminalToken;
        if (token && !exchangeRates[token.attributes.address]) {
          exchangeRates[token.attributes.address] = prices[index];
          tokensAddressesSet.delete(token.attributes.address);
        }
      });
    });
    pageNumber++;
  } while (!responseWasEmpty && tokensAddressesSet.size > 0 && pageNumber <= 10);

  return exchangeRates;
}

async function get3RouteEvmTokenPrices(tokens: Route3EvmTokens['tokens']) {
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

export const get3RouteEvmTokensWithPrices = memoizee(
  async () => {
    const tokensResponse = await axios.get<Route3EvmTokens>('https://temple-evm.3route.io/api/v6.1/42793/tokens', {
      headers: { Authorization: `Bearer ${EnvVars.ROUTE3_EVM_API_KEY}` }
    });

    const { tokens } = tokensResponse.data;

    const prices = await get3RouteEvmTokenPrices(tokens);

    return Object.fromEntries(
      Object.entries(tokens).map(([address, token]) => [
        address,
        { ...token, logoURI: token.logoURI || undefined, priceUSD: prices[address] }
      ])
    );
  },
  { promise: true, maxAge: 20000 }
);
