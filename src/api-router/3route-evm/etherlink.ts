import axios from 'axios';
import { RateLimiterRedis } from 'rate-limiter-flexible';

import { redisClient } from '../../redis';

import { withRateLimiter } from './utils';

export type PageParams = Record<string, string | number | boolean | null>;

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

const etherlinkApiLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-etherlink-api',
  points: 10,
  duration: 1,
  blockDuration: 1
});

export const getXtzPrice = withRateLimiter(etherlinkApiLimiter, async () => {
  const { data } = await axios.get<EtherlinkStats>('https://explorer.etherlink.com/api/v2/stats');

  return data.coin_price;
});

export const getTokensPage = withRateLimiter(etherlinkApiLimiter, async (pageParams: PageParams | null) => {
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
