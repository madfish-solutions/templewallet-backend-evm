import {
  createRateLimiter,
  createUpstreamApi,
  fetchTokenPrices,
  isPrice,
  RequestContext,
  withRateLimiter
} from './utils';

interface EtherlinkToken {
  exchange_rate: string | null;
}

interface EtherlinkStats {
  coin_price: string;
}

const etherlinkApi = createUpstreamApi('https://explorer.etherlink.com/api/v2');
const etherlinkApiLimiter = createRateLimiter('rl-etherlink-api', 10, 1);

export const getXtzPrice = withRateLimiter(
  etherlinkApiLimiter,
  async ({ signal }: RequestContext = {}): Promise<string | undefined> => {
    const { data } = await etherlinkApi.get<EtherlinkStats>('/stats', { signal });

    return isPrice(data.coin_price) ? data.coin_price : undefined;
  }
);

const getTokenPrice = withRateLimiter(
  etherlinkApiLimiter,
  async (address: string, { signal }: RequestContext): Promise<Record<string, string>> => {
    const { data } = await etherlinkApi.get<EtherlinkToken>(`/tokens/${address}`, { signal });

    return isPrice(data.exchange_rate) ? { [address]: data.exchange_rate } : {};
  }
);

export const getEtherlinkExchangeRates = (
  addresses: string[],
  context: RequestContext = {}
): Promise<Record<string, string>> =>
  fetchTokenPrices(
    [...new Set(addresses.map(address => address.toLowerCase()))],
    address => getTokenPrice(address, context),
    context.signal
  );
