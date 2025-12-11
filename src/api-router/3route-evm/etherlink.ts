import axios from 'axios';

import { createRateLimiter, withRateLimiter } from './utils';

type PageParams = Record<string, string | number | boolean | null>;

/** This definition is not complete, it's just a subset of the full response */
interface EtherlinkToken {
  address_hash: string;
  exchange_rate: string | null;
  icon_url: string | null;
  name: string;
  symbol: string;
}

interface EtherlinkTokensPage {
  next_page_params: PageParams | null;
  items: EtherlinkToken[];
}

/** This definition is not complete, it's just a subset of the full response */
interface EtherlinkStats {
  coin_price: string;
}

const etherlinkApiLimiter = createRateLimiter('rl-etherlink-api', 10, 1);

export const getXtzPrice = withRateLimiter(etherlinkApiLimiter, async () => {
  const { data } = await axios.get<EtherlinkStats>('https://explorer.etherlink.com/api/v2/stats');

  return data.coin_price;
});

const getTokensPage = withRateLimiter(etherlinkApiLimiter, async (pageParams: PageParams | null) => {
  const { data } = await axios.get<EtherlinkTokensPage>('https://explorer.etherlink.com/api/v2/tokens', {
    params: {
      type: 'ERC-20',
      ...(pageParams
        ? Object.fromEntries(Object.entries(pageParams).map(([key, value]) => [key, value === null ? 'null' : value]))
        : {})
    }
  });

  return data;
});

export async function getEtherlinkExchangeRates(tokensAddresses: string[]) {
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
