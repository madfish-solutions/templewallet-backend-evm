import axios from 'axios';

import { createRateLimiter, withRateLimiter } from './utils';

/** These types are not complete, they're just a subset of the full response */
interface GeckoterminalEntityBase {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
}

interface GeckoterminalToken extends GeckoterminalEntityBase {
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

const geckoterminalApiLimiter = createRateLimiter('rl-geckoterminal-api', 30, 60);

const getPoolsPage = withRateLimiter(geckoterminalApiLimiter, async (pageNumber: number) => {
  const { data } = await axios.get<GeckoterminalPoolsPage>(
    'https://api.geckoterminal.com/api/v2/networks/etherlink/pools',
    { params: { include: 'base_token,quote_token', page: pageNumber, sort: 'h24_volume_usd_desc' } }
  );

  return data;
});

export async function getGeckoterminalExchangeRates(tokensAddresses: string[]) {
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
