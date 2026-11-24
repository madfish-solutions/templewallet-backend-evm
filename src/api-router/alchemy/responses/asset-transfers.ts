import {
  AssetTransfersCategory,
  AssetTransfersWithMetadataParams,
  AssetTransfersWithMetadataResult,
  SortingOrder
} from '@temple-wallet/alchemy-sdk';
import memoizee from 'memoizee';
import { createPublicClient, GetBlockReturnType, http, PublicClient } from 'viem';

import { ALCHEMY_CHAINS_NAMES, KNOWN_VIEM_CHAINS } from '../../../utils/chains.js';
import { CodedError } from '../../../utils/errors.js';
import { ChainNotSupportedError, makeAlchemyRpcUrl, makeFallbackPublicClient } from '../../../utils/public-client.js';
import {
  ALCHEMY_CLIENTS_CACHE_SIZE,
  ASSET_CATEGORIES,
  ETH_TOKEN_SLUG,
  EXCLUDED_INTERNAL_CATEGORY,
  GAS_CATEGORIES,
  TR_PSEUDO_LIMIT
} from '../constants.js';
import { AlchemyQueueJobsInputs } from '../types.js';
import { getAlchemyClient } from '../utils.js';

const makeFallbackPublicClientWithAlchemy = memoizee(
  (chainId: number) => {
    if (!(chainId in ALCHEMY_CHAINS_NAMES)) {
      throw new ChainNotSupportedError(chainId);
    }

    return makeFallbackPublicClient(chainId, ALCHEMY_CHAINS_NAMES[chainId]);
  },
  { max: ALCHEMY_CLIENTS_CACHE_SIZE }
);

const makeFreeNodesPublicClients = memoizee(
  (chainId: number): PublicClient[] => {
    if (!(chainId in ALCHEMY_CHAINS_NAMES)) {
      throw new ChainNotSupportedError(chainId);
    }

    const chain = KNOWN_VIEM_CHAINS[chainId];

    return chain.rpcUrls.default.http.map(rpcUrl =>
      createPublicClient({
        chain,
        transport: http(rpcUrl, { retryCount: 0 })
      })
    );
  },
  { max: ALCHEMY_CLIENTS_CACHE_SIZE }
);

const makeAlchemyRpcClient = memoizee(
  (chainId: number) => {
    if (!(chainId in ALCHEMY_CHAINS_NAMES)) {
      throw new ChainNotSupportedError(chainId);
    }

    return createPublicClient({
      chain: KNOWN_VIEM_CHAINS[chainId],
      transport: http(makeAlchemyRpcUrl(ALCHEMY_CHAINS_NAMES[chainId]))
    });
  },
  { max: ALCHEMY_CLIENTS_CACHE_SIZE }
);

const getBlockTimestamp = memoizee(
  async (chainId: number, blockNumber: string) => {
    const fallbackPublicClient = makeFallbackPublicClientWithAlchemy(chainId);

    let block: { timestamp?: string | bigint } & Record<string, unknown>;

    try {
      block = await fallbackPublicClient.getBlock({ blockNumber: BigInt(blockNumber), includeTransactions: false });
    } catch (e) {
      if (e instanceof ChainNotSupportedError) {
        throw e;
      }

      const freeNodesResults = await Promise.allSettled(
        makeFreeNodesPublicClients(chainId).map(client =>
          Promise.race([
            client.getBlock({ blockNumber: BigInt(blockNumber), includeTransactions: false }),
            new Promise<GetBlockReturnType>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ])
        )
      );
      const resultWithTimestamp = freeNodesResults.find(
        (result): result is PromiseFulfilledResult<GetBlockReturnType> =>
          result.status === 'fulfilled' && Boolean(result.value.timestamp)
      );

      if (resultWithTimestamp) {
        block = resultWithTimestamp.value;
      } else {
        const alchemyRpcClient = makeAlchemyRpcClient(chainId);
        block = await alchemyRpcClient.getBlock({ blockNumber: BigInt(blockNumber), includeTransactions: false });
      }
    }
    const { timestamp } = block;

    if (!timestamp) throw new CodedError(500, 'Block timestamp not found');

    return new Date(Number(timestamp) * 1000).toISOString();
  },
  { max: 1e6, length: 2, promise: true }
);

export const getAssetTransfersResponse = async (
  data: AlchemyQueueJobsInputs['assetTransfers']
): Promise<AssetTransfersWithMetadataResult[]> => {
  const { chainId, accAddress, toAcc, toBlock } = data;
  const alchemy = getAlchemyClient(chainId);

  let { contractAddress } = data;
  const categories = new Set(
    contractAddress === ETH_TOKEN_SLUG
      ? GAS_CATEGORIES
      : contractAddress
        ? ASSET_CATEGORIES // (!) Won't have gas transfer operations in batches this way; no other way found
        : Object.values(AssetTransfersCategory)
  );

  if (EXCLUDED_INTERNAL_CATEGORY.has(alchemy.config.network)) categories.delete(AssetTransfersCategory.INTERNAL);

  if (contractAddress === ETH_TOKEN_SLUG) contractAddress = undefined;

  const reqOptions: AssetTransfersWithMetadataParams = {
    contractAddresses: contractAddress ? [contractAddress] : undefined,
    order: SortingOrder.DESCENDING,
    category: Array.from(categories),
    excludeZeroValue: true,
    withMetadata: true,
    toBlock,
    maxCount: TR_PSEUDO_LIMIT
  };

  if (toAcc) reqOptions.toAddress = accAddress;
  else reqOptions.fromAddress = accAddress;

  const { transfers: rawTransfers } = await alchemy.core.getAssetTransfers(reqOptions);

  return await Promise.all(
    rawTransfers.map(async rawTransfer => {
      if (rawTransfer.metadata) {
        return rawTransfer;
      }

      return {
        ...rawTransfer,
        metadata: {
          blockTimestamp: await getBlockTimestamp(data.chainId, rawTransfer.blockNum)
        }
      };
    })
  );
};
