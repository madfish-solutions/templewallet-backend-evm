import axios from 'axios';
import { RateLimiterRedis } from 'rate-limiter-flexible';

import { redisClient } from '../../redis';

import { withRateLimiter } from './utils';

/** These types are not complete, they're just a subset of the full response */
interface GeckoterminalEntityBase {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
}

export interface GeckoterminalToken extends GeckoterminalEntityBase {
  type: 'token';
  attributes: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    image_url: string;
  };
}

interface GeckoterminalDex extends GeckoterminalEntityBase {
  type: 'dex';
}

interface GeckoterminalPool extends GeckoterminalEntityBase {
  type: 'pool';
  attributes: {
    base_token_price_usd: string;
    quote_token_price_usd: string;
  };
  relationships: {
    base_token: {
      data: Pick<GeckoterminalToken, 'id' | 'type'>;
    };
    quote_token: {
      data: Pick<GeckoterminalToken, 'id' | 'type'>;
    };
    dex: {
      data: Pick<GeckoterminalDex, 'id' | 'type'>;
    };
  };
}

interface GeckoterminalPoolsPage {
  data: GeckoterminalPool[];
  included: (GeckoterminalToken | GeckoterminalDex)[];
}

const geckoterminalApiLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl-geckoterminal-api',
  points: 30,
  duration: 60,
  blockDuration: 2
});

export const getPoolsPage = withRateLimiter(geckoterminalApiLimiter, async (pageNumber: number) => {
  const { data } = await axios.get<GeckoterminalPoolsPage>(
    'https://api.geckoterminal.com/api/v2/networks/etherlink/pools',
    { params: { include: 'base_token,quote_token', page: pageNumber, sort: 'h24_volume_usd_desc' } }
  );

  return data;
});
