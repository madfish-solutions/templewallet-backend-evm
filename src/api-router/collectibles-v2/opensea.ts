import { BatchNftsRequest, NFT, NftBatchResponse, OpenSeaSDK } from '@opensea/sdk/viem';
import memoizee from 'memoizee';
import { Chain } from 'viem';

import {
  EnvVars,
  OPENSEA_FORBID_REPEATED_FETCH_TIMEOUT,
  OPENSEA_REQUESTS_LIMIT,
  OPENSEA_REQUESTS_LIMIT_INTERVAL
} from '../../config.js';
import {
  getCachedHmValues,
  getCacheKey,
  getHmCacheKeys,
  setCachedHmValues,
  withRedisCache
} from '../../utils/cache.js';
import { EvmOpenseaChain, KNOWN_VIEM_CHAINS, openseaChains } from '../../utils/chains.js';
import { ChainNotSupportedError, makeFallbackPublicClient } from '../../utils/public-client.js';
import { withRateLimitWaiting } from '../../utils/rate-limiting.js';
import { createRateLimiter } from '../3route-evm/utils.js';

type ArrayElement<T extends unknown[]> = T extends (infer U)[] ? U : never;
interface OpenseaNftCacheEntry extends ArrayElement<NftBatchResponse['nfts']> {
  chainId: number;
  cacheUpdatedAt: number;
}

const openseaGlobalApiRateLimiter = createRateLimiter(
  'rl-opensea-global-api',
  OPENSEA_REQUESTS_LIMIT,
  Math.ceil(OPENSEA_REQUESTS_LIMIT_INTERVAL / 1000)
);

const makeNftsBatchRequest = withRateLimitWaiting<
  [sdk: OpenSeaSDK, request: BatchNftsRequest, signal: AbortSignal],
  NftBatchResponse
>(
  openseaGlobalApiRateLimiter,
  (sdk, request) => sdk.api.nfts.getNFTsBatch({ identifiers: request.identifiers }),
  (_, _2, signal) => signal
);

type SearchAssetType = 'collection' | 'nft' | 'token' | 'account';

/**
 * Account NFT list wire shape. The SDK types this as {@link NFT} (`NftDetailed`), which has
 * `owners` and no balance. The live payload is the list NFT plus `quantity` / `quantity_string`.
 * `api.get` camelizes the response, so callers see `quantityString`.
 */
type AccountNftsWireResponse = {
  nfts: Array<NFT & { quantity: number; quantity_string: string }>;
  next: string | null;
};
export type OpenseaAccountNft = NFT & { quantity: number; quantityString: string };

const makeAccountNftsRequest = withRateLimitWaiting(
  openseaGlobalApiRateLimiter,
  (sdk: OpenSeaSDK, address: string, collection?: string, next?: string) =>
    sdk.api.get<AccountNftsWireResponse>(`/api/v2/chain/${sdk.chain}/account/${address}/nfts`, {
      limit: 200,
      next,
      includeAutoHidden: true,
      collection
    })
);

const makeAccountCollectionsRequest = withRateLimitWaiting(
  openseaGlobalApiRateLimiter,
  (sdk: OpenSeaSDK, address: string, chains?: EvmOpenseaChain[], limit?: number, after?: string) =>
    sdk.api.accounts.getProfileCollections(address, { after, limit, chains })
);

const makeSearchRequest = withRateLimitWaiting(
  openseaGlobalApiRateLimiter,
  (sdk: OpenSeaSDK, query: string, assetTypes: SearchAssetType[], chains?: EvmOpenseaChain[], limit?: number) =>
    sdk.api.search({ query, assetTypes, chains, limit })
);

const getOpenseaSdk = memoizee(
  (chainId = 1) => {
    if (!(chainId in openseaChains)) {
      throw new ChainNotSupportedError(chainId);
    }

    const openseaChain = openseaChains[chainId];
    const chain: Chain | undefined = KNOWN_VIEM_CHAINS[chainId];
    const rpcUrl = chain?.rpcUrls.default.http[0];

    if (!rpcUrl) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    return new OpenSeaSDK(
      { publicClient: makeFallbackPublicClient(chainId), rpcUrl },
      { chain: openseaChain, apiKey: EnvVars.OPENSEA_API_KEY }
    );
  },
  { max: Object.keys(openseaChains).length, length: 1 }
);

export interface NftRef {
  chainId: number;
  contractAddress: string;
  tokenId: string;
}

const nftMetadataCacheHmKey = getCacheKey('opensea', ['nft-metadata']);
const getNftMetadataCacheKeys = (request: NftRef[]) =>
  getHmCacheKeys(request.map(({ contractAddress, tokenId, chainId }) => [contractAddress, tokenId, chainId]));

const getContractIdKey = (contractAddress: string, tokenId: string) =>
  `${contractAddress.toLowerCase()}-${tokenId.toLowerCase()}`;

const updateNftMetadataCache = (values: Record<string, OpenseaNftCacheEntry>, now: number) =>
  setCachedHmValues(nftMetadataCacheHmKey, values, 1e9, 1e6, now);

export const getCachedNftsByRefs = async (request: NftRef[]) => {
  const hmHashKeys = getNftMetadataCacheKeys(request);
  const results = await getCachedHmValues<OpenseaNftCacheEntry>(nftMetadataCacheHmKey, hmHashKeys);

  return results.map(entry => entry ?? null);
};

export const getNftsByRefs = async (request: NftRef[]) => {
  const refsByContractIdKeys = Object.fromEntries(
    request.map(ref => [getContractIdKey(ref.contractAddress, ref.tokenId), ref])
  );
  const hmHashKeys = getNftMetadataCacheKeys(request);
  const cachedResults = await getCachedHmValues<OpenseaNftCacheEntry>(nftMetadataCacheHmKey, hmHashKeys);
  const sdk = getOpenseaSdk();
  let now = Date.now();
  const requestInput = request
    .filter(({ chainId }, i) => {
      const { cacheUpdatedAt } = cachedResults[i] ?? { cacheUpdatedAt: 0 };

      return now - cacheUpdatedAt >= OPENSEA_FORBID_REPEATED_FETCH_TIMEOUT && chainId in openseaChains;
    })
    .map(({ chainId, ...restProps }) => ({
      chain: openseaChains[chainId],
      ...restProps
    }));

  const abortSignal = AbortSignal.timeout(60000);
  now = Date.now();
  const { nfts } = requestInput.length
    ? await makeNftsBatchRequest(sdk, { identifiers: requestInput }, abortSignal)
    : { nfts: [] };
  const openseaNftsByContractIdKeys = Object.fromEntries(
    nfts.map(nft => {
      const { contract, identifier } = nft;
      const { chainId } = refsByContractIdKeys[getContractIdKey(contract, identifier)];

      return [getContractIdKey(contract, identifier), { ...nft, chainId, cacheUpdatedAt: now }];
    })
  );

  if (nfts.length > 0) {
    const redisKeys = getNftMetadataCacheKeys(
      nfts.map(nft => refsByContractIdKeys[getContractIdKey(nft.contract, nft.identifier)])
    );
    await updateNftMetadataCache(
      Object.fromEntries(
        redisKeys.map((redisKey, i) => {
          const { contract, identifier } = nfts[i];

          return [redisKey, openseaNftsByContractIdKeys[getContractIdKey(contract, identifier)]];
        })
      ),
      now
    );
  }

  return Array.from({ length: request.length }, (_, i) => {
    const { contractAddress, tokenId } = request[i];

    return openseaNftsByContractIdKeys[getContractIdKey(contractAddress, tokenId)] ?? cachedResults[i] ?? null;
  });
};

export const getAccountNfts = async (address: string, chainId: number, collection?: string, next?: string) =>
  withRedisCache(
    getCacheKey('opensea', ['account-nfts', address.toLowerCase(), chainId, collection, next]),
    10,
    async () => {
      if (!(chainId in openseaChains)) {
        return { nfts: [], next: null };
      }

      const now = Date.now();
      const data = await makeAccountNftsRequest(getOpenseaSdk(chainId), address, collection, next);
      const hmHashKeys = getNftMetadataCacheKeys(
        data.nfts.map(nft => ({ contractAddress: nft.contract, tokenId: nft.identifier, chainId }))
      );

      await updateNftMetadataCache(
        Object.fromEntries(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          data.nfts.map(({ quantity, quantityString, ...nft }, i) => [
            hmHashKeys[i],
            { ...nft, chainId, cacheUpdatedAt: now }
          ])
        ),
        now
      );

      return data;
    }
  );

export const getAccountCollections = async (address: string, chainIds?: number[], limit?: number, after?: string) =>
  withRedisCache(
    getCacheKey('opensea', ['account-collections', address.toLowerCase(), chainIds?.join(','), limit, after]),
    10,
    async () => {
      const relevantChains = chainIds ? chainIds.map(chainId => openseaChains[chainId]).filter(Boolean) : undefined;

      if (relevantChains?.length === 0) {
        return { collections: [], next: null };
      }

      return await makeAccountCollectionsRequest(getOpenseaSdk(), address, relevantChains, limit, after);
    }
  );

export const getOpenseaSearch = async (
  query: string,
  assetTypes: SearchAssetType[],
  chainIds?: number[],
  limit?: number
) =>
  withRedisCache(
    getCacheKey('opensea', ['search', query, assetTypes.join(','), chainIds?.join(','), limit]),
    10,
    async () => {
      const relevantChains = chainIds ? chainIds.map(chainId => openseaChains[chainId]).filter(Boolean) : undefined;

      if (relevantChains?.length === 0) {
        return { results: [], next: null };
      }

      return await makeSearchRequest(getOpenseaSdk(), query, assetTypes, relevantChains, limit);
    }
  );
