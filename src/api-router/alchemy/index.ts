import { Log } from '@temple-wallet/alchemy-sdk';
import range from 'lodash/range.js';
import uniqBy from 'lodash/uniqBy.js';
import uniqueId from 'lodash/uniqueId.js';

import { withRedisCache } from '../../utils/cache.js';

import {
  APPROVALS_REQUESTS_LIMIT_PER_TXS_REQUEST,
  BLOCK_RANGE_ERROR_REGEX,
  CACHE_TTLS,
  ETH_TOKEN_SLUG,
  GAS_CATEGORIES
} from './constants.js';
import { fetchTransfers } from './fetchers/transfers.js';
import { fetch } from './queued-fetch-jobs.js';
import { AlchemyQueueJobsInputs, FetchTransactionsResponse } from './types.js';
import { getAlchemyCacheKey, getAlchemyCacheKeyFromObject } from './utils.js';

export { queue as alchemyRequestsQueue } from './queued-fetch-jobs.js';

export async function fetchLastTransferTimestamp(chainId: number, accAddress: string): Promise<string | undefined> {
  const cacheKey = getAlchemyCacheKey('lastTransferTimestamp', chainId, accAddress);

  return withRedisCache(cacheKey, CACHE_TTLS.lastTransferTimestamp, async () => {
    const txReqId = uniqueId('txReqId-');
    const transfers = await fetchTransfers(txReqId, chainId, accAddress);

    return transfers[0]?.metadata.blockTimestamp;
  });
}

export async function fetchTransactions(
  chainId: number,
  accAddress: string,
  contractAddress?: string,
  olderThanBlockHeight?: `${number}`
): Promise<FetchTransactionsResponse> {
  const cacheKey = getAlchemyCacheKey(
    'transactions',
    chainId,
    accAddress,
    contractAddress ?? 'all',
    olderThanBlockHeight ?? 'latest'
  );

  return withRedisCache(cacheKey, CACHE_TTLS.transactions, async () => {
    const txReqId = uniqueId('txReqId-');
    const transfers = await fetchTransfers(txReqId, chainId, accAddress, contractAddress, olderThanBlockHeight);

    if (!transfers.length || contractAddress === ETH_TOKEN_SLUG) {
      return { transfers, approvals: [] };
    }

    let approvals: Log[] = [];
    const highestBlockNum = transfers.at(0)!.blockNum;
    const lowestBlockNum = transfers.at(-1)!.blockNum;
    try {
      approvals = await fetch('approvals', {
        txReqId,
        chainId,
        accAddress,
        contractAddress,
        toBlock: highestBlockNum,
        fromBlock: lowestBlockNum
      });
    } catch (e: any) {
      const blockErrorRangeMatch = e?.message?.match(BLOCK_RANGE_ERROR_REGEX);

      if (!blockErrorRangeMatch) {
        throw e;
      }

      const blockRange = parseInt(blockErrorRangeMatch[1], 10);
      const parsedHighestBlockNum = Number(highestBlockNum);
      const parsedLowestBlockNum = Number(lowestBlockNum);
      const requestsCountForAllBlocks = Math.ceil((parsedHighestBlockNum - parsedLowestBlockNum + 1) / blockRange);
      let blocksRanges: [number, number][];
      const sendTokenTransfers = transfers
        .filter(
          ({ from, category }) => from.toLowerCase() === accAddress.toLowerCase() && !GAS_CATEGORIES.includes(category)
        )
        .slice(0, APPROVALS_REQUESTS_LIMIT_PER_TXS_REQUEST);
      if (requestsCountForAllBlocks <= sendTokenTransfers.length) {
        blocksRanges = range(parsedLowestBlockNum, parsedHighestBlockNum + 1, blockRange).map(fromBlock => [
          fromBlock,
          fromBlock + blockRange - 1
        ]);
      } else {
        blocksRanges = sendTokenTransfers
          .map(({ blockNum }) => [
            Math.max(Number(blockNum) - Math.floor(blockRange / 2) + 1, parsedLowestBlockNum),
            Math.min(Number(blockNum) + Math.floor(blockRange / 2), parsedHighestBlockNum)
          ])
          .reduce<[number, number][]>((acc, [fromBlock, toBlock]) => {
            // Merge intervals that are in start descending order
            const last = acc.at(-1);
            if (!last) {
              acc.push([fromBlock, toBlock]);

              return acc;
            }

            const [lastFromBlock, lastToBlock] = last;
            const newToBlock = Math.min(lastFromBlock - 1, toBlock);

            if (fromBlock > newToBlock) {
              return acc;
            }

            if (lastFromBlock - newToBlock > 1 || lastToBlock - fromBlock + 1 > blockRange) {
              acc.push([fromBlock, newToBlock]);
            } else {
              last[0] = fromBlock;
            }

            return acc;
          }, [])
          .reverse();
      }
      const approvalsChunks = await Promise.all(
        blocksRanges.map(([fromBlock, toBlock]) =>
          fetch('approvals', {
            txReqId,
            chainId,
            accAddress,
            contractAddress,
            toBlock: `0x${toBlock.toString(16)}`,
            fromBlock: `0x${fromBlock.toString(16)}`
          })
        )
      );
      approvals = uniqBy(approvalsChunks.flat(), log => `${log.transactionHash}-${log.logIndex}`);
    }

    return { transfers, approvals };
  });
}

export function fetchEvmCollectibles(input: Omit<AlchemyQueueJobsInputs['nftsForOwner'], 'nftsReqId'>) {
  const cacheKey = getAlchemyCacheKeyFromObject('nftsForOwner', input, [
    'chainId',
    'accAddress',
    'contractAddresses',
    'withMetadata',
    'orderBy',
    'pageKey',
    'excludeFilters',
    'includeFilters',
    'spamConfidenceLevel'
  ]);

  return withRedisCache(cacheKey, CACHE_TTLS.nftsForOwner, () => {
    const nftsReqId = uniqueId('nftsReqId-');

    return fetch('nftsForOwner', { nftsReqId, ...input });
  });
}

export function fetchEvmCollectiblesContracts(input: Omit<AlchemyQueueJobsInputs['contractsForOwner'], 'nftsReqId'>) {
  const cacheKey = getAlchemyCacheKeyFromObject('contractsForOwner', input, [
    'chainId',
    'accAddress',
    'orderBy',
    'pageKey',
    'excludeFilters',
    'includeFilters',
    'spamConfidenceLevel'
  ]);

  return withRedisCache(cacheKey, CACHE_TTLS.contractsForOwner, () => {
    const nftsReqId = uniqueId('nftsReqId-');

    return fetch('contractsForOwner', { nftsReqId, ...input });
  });
}
