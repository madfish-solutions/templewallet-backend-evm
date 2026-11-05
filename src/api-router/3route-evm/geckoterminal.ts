import { createRateLimiter, createUpstreamApi, isPrice, RequestContext, withRateLimiter } from './utils';

interface GeckoterminalPrices {
  data: { attributes: { token_prices: Record<string, string> } };
}

const geckoterminalApi = createUpstreamApi('https://api.geckoterminal.com/api/v2');
const geckoterminalApiLimiter = createRateLimiter('rl-geckoterminal-api', 30, 60);

const getTokenPrice = withRateLimiter(
  geckoterminalApiLimiter,
  async (addresses: string[], { signal }: RequestContext): Promise<Record<string, string>> => {
    const { data } = await geckoterminalApi.get<GeckoterminalPrices>(
      `/simple/networks/etherlink/token_price/${addresses.join(',')}`,
      {
        signal
      }
    );

    return Object.fromEntries(
      Object.entries(data.data.attributes.token_prices)
        .filter(([key, price]) => addresses.includes(key.toLowerCase()) && isPrice(price))
        .map(([key, price]) => [key.toLowerCase(), price])
    );
  }
);

export const getGeckoterminalExchangeRates = async (
  addresses: string[],
  context: RequestContext = {}
): Promise<Record<string, string>> => {
  const unique = [...new Set(addresses.map(address => address.toLowerCase()))];
  const prices: Record<string, string> = {};
  for (let index = 0; index < unique.length && !context.signal?.aborted; index += 10) {
    try {
      Object.assign(prices, await getTokenPrice(unique.slice(index, index + 10), context));
    } catch {
      // A failed batch does not discard prices from other batches.
    }
  }

  return prices;
};
