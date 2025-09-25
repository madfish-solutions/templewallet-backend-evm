import {
  Alchemy,
  AssetTransfersCategory,
  Network,
  AssetTransfersWithMetadataParams,
  SortingOrder,
  AssetTransfersWithMetadataResult,
  Log
} from 'alchemy-sdk';
import { range, uniqBy, uniqueId } from 'lodash';
import memoizee from 'memoizee';
import { createPublicClient, fallback, http } from 'viem';

import { ALCHEMY_ATTEMPTS, ALCHEMY_BACKOFF_DELAY, ALCHEMY_CONCURRENCY, ALCHEMY_CUPS, EnvVars } from '../config';
import { CodedError } from '../utils/errors';
import { createQueuedFetchJobs } from '../utils/queued-fetch-jobs';

import { ALCHEMY_CHAINS_NAMES, ALCHEMY_VIEM_CHAINS } from './constants';

const ETH_TOKEN_SLUG = 'eth' as const;
const TR_PSEUDO_LIMIT = 50;
const APPROVALS_REQUESTS_LIMIT_PER_TXS_REQUEST = 3;

type AlchemyQueueJobName = 'assetTransfers' | 'approvals';
interface AlchemyQueueJobsInputs {
  assetTransfers: {
    /** Only for testing and debugging */
    txReqId: string;
    chainId: number;
    accAddress: string;
    contractAddress?: string;
    toAcc: boolean;
    toBlock?: string;
  };
  approvals: {
    /** Only for testing and debugging */
    txReqId: string;
    chainId: number;
    accAddress: string;
    contractAddress?: string;
    toBlock: string;
    fromBlock: string;
  };
}

interface AlchemyQueueJobsOutputs {
  assetTransfers: AssetTransfersWithMetadataResult[];
  approvals: Log[];
}

interface FetchTransactionsResponse {
  transfers: AssetTransfersWithMetadataResult[];
  approvals: Log[];
}

type JobArgs<T extends AlchemyQueueJobName> = [name: T, data: AlchemyQueueJobsInputs[T]];
function getAlchemyJobDeduplicationId(...args: JobArgs<'assetTransfers'>): string;
function getAlchemyJobDeduplicationId(...args: JobArgs<'approvals'>): string;
function getAlchemyJobDeduplicationId(...args: JobArgs<'assetTransfers'> | JobArgs<'approvals'>): string {
  const [name, data] = args;

  if (name === 'assetTransfers') {
    const { chainId, accAddress, contractAddress, toAcc, toBlock } = data;

    return `${name}:${chainId}:${accAddress.toLowerCase()}:${contractAddress?.toLowerCase()}:${toAcc}:${toBlock}`;
  }

  const { chainId, accAddress, contractAddress, toBlock, fromBlock } = data;

  return `${name}:${chainId}:${accAddress.toLowerCase()}:${contractAddress?.toLowerCase()}:${toBlock}:${fromBlock}`;
}

const BLOCK_RANGE_ERROR_REGEX = /You can make eth_getLogs requests with up to a (\d+) block range./;

async function getAlchemyResponse(...args: JobArgs<'assetTransfers'>): Promise<AssetTransfersWithMetadataResult[]>;
async function getAlchemyResponse(...args: JobArgs<'approvals'>): Promise<Log[]>;
async function getAlchemyResponse(
  ...args: JobArgs<'assetTransfers'> | JobArgs<'approvals'>
): Promise<AssetTransfersWithMetadataResult[] | Log[]> {
  const [name, data] = args;
  const alchemy = getAlchemyClient(data.chainId);

  if (name === 'assetTransfers') {
    const { accAddress, toAcc, toBlock } = data;
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
  }

  const { accAddress, contractAddress, toBlock, fromBlock } = data;

  try {
    return await alchemy.core.getLogs({
      address: contractAddress,
      topics: [
        [
          '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925', // Approval
          '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31' // ApprovalForAll
        ],
        `0x${accAddress.slice(2).padStart(64, '0')}`
      ],
      toBlock,
      fromBlock
    });
  } catch (e: any) {
    if (e?.error?.code === -32602) return [];

    if (e?.message?.match(BLOCK_RANGE_ERROR_REGEX)) {
      throw new CodedError(400, e.message);
    }

    throw e;
  }
}

const alchemyRequestsCosts = { assetTransfers: 120, approvals: 60 };

const { fetch, queue } = createQueuedFetchJobs<AlchemyQueueJobName, AlchemyQueueJobsInputs, AlchemyQueueJobsOutputs>({
  queueName: 'alchemy-requests',
  costs: alchemyRequestsCosts,
  limitDuration: 1000,
  limitAmount: ALCHEMY_CUPS,
  concurrency: ALCHEMY_CONCURRENCY,
  attempts: ALCHEMY_ATTEMPTS,
  backoffDelay: ALCHEMY_BACKOFF_DELAY,
  getDeduplicationId: getAlchemyJobDeduplicationId,
  getOutput: getAlchemyResponse
});

export const alchemyRequestsQueue = queue;

const makePublicClient = memoizee(
  (chainId: number) => {
    if (!(chainId in ALCHEMY_VIEM_CHAINS)) {
      throw new Error(`Chain ${chainId} not supported`);
    }

    return createPublicClient({
      chain: ALCHEMY_VIEM_CHAINS[chainId],
      transport: fallback([
        ...ALCHEMY_VIEM_CHAINS[chainId].rpcUrls.default.http.map(rpcUrl => http(rpcUrl)),
        http(`https://${ALCHEMY_CHAINS_NAMES[chainId]}.g.alchemy.com/v2/${EnvVars.ALCHEMY_API_KEY}`)
      ])
    });
  },
  { max: Object.keys(ALCHEMY_VIEM_CHAINS).length }
);

export const getBlockTimestamp = memoizee(
  async (chainId: number, blockNumber: string) => {
    const publicClient = makePublicClient(chainId);

    const { timestamp } = await publicClient.getBlock({
      blockNumber: BigInt(blockNumber),
      includeTransactions: false
    });

    if (!timestamp) throw new CodedError(500, 'Block timestamp not found');

    return new Date(Number(timestamp) * 1000).toISOString();
  },
  { max: 1e6, length: 2, promise: true }
);

export async function fetchTransactions(
  chainId: number,
  accAddress: string,
  contractAddress?: string,
  olderThanBlockHeight?: `${number}`
): Promise<FetchTransactionsResponse> {
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
}

async function fetchTransfers(
  txReqId: string,
  chainId: number,
  accAddress: string,
  /** Without token ID means ERC-20 tokens only */
  contractAddress?: string,
  olderThanBlockHeight?: `${number}`
): Promise<AssetTransfersWithMetadataResult[]> {
  const toBlock = olderThanBlockToToBlockValue(olderThanBlockHeight);
  const transfersRequestBase = { chainId, accAddress, contractAddress, toBlock, txReqId };

  const [rawTransfersFrom, rawTransfersTo] = await Promise.all([
    fetch('assetTransfers', { ...transfersRequestBase, toAcc: false }),
    fetch('assetTransfers', { ...transfersRequestBase, toAcc: true })
  ]);

  const allTransfers = mergeFetchedTransfers(rawTransfersFrom, rawTransfersTo);

  if (!allTransfers.length) return [];

  allTransfers.sort(sortPredicate);

  /** Will need to filter those transfers, that r made from & to the same address */
  const uniqByKey: keyof (typeof allTransfers)[number] = 'uniqueId';

  return uniqBy(cutOffTrailingSameHashes(allTransfers), uniqByKey);
}

/** Order of the lists (which goest 1st) is not important here */
function mergeFetchedTransfers(
  transfersFrom: AssetTransfersWithMetadataResult[],
  transfersTo: AssetTransfersWithMetadataResult[]
) {
  // 1. One of them is empty
  if (!transfersFrom.length) return transfersTo;
  if (!transfersTo.length) return transfersFrom;

  // 2. Both haven't reached the limit - basically reached the end for both
  if (transfersFrom.length < TR_PSEUDO_LIMIT && transfersTo.length < TR_PSEUDO_LIMIT)
    return transfersFrom.concat(transfersTo);

  // 3. Second hasn't reached the limit; first reached the end
  if (transfersTo.length < TR_PSEUDO_LIMIT) {
    // transfersFrom.length === TR_PSEUDO_LIMIT here
    const edgeBlockNum = transfersTo.at(-1)!.blockNum;

    return transfersFrom.filter(t => t.blockNum >= edgeBlockNum).concat(transfersTo);
  }

  // 4. First hasn't reached the limit; second reached the end
  if (transfersFrom.length < TR_PSEUDO_LIMIT) {
    // transfersTo.length === TR_PSEUDO_LIMIT here
    const edgeBlockNum = transfersFrom.at(-1)!.blockNum;

    return transfersTo.filter(t => t.blockNum >= edgeBlockNum).concat(transfersFrom);
  }

  // 5. Both reached the limit

  const trFromLastBlockNum = transfersFrom.at(-1)!.blockNum;

  if (trFromLastBlockNum > transfersTo.at(0)!.blockNum) return transfersFrom;

  const trToLastBlockNum = transfersTo.at(-1)!.blockNum;

  if (trToLastBlockNum > transfersFrom.at(0)!.blockNum) return transfersTo;

  if (trFromLastBlockNum > trToLastBlockNum) {
    transfersTo = transfersTo.filter(tr => tr.blockNum >= trFromLastBlockNum);
  } else {
    transfersFrom = transfersFrom.filter(tr => tr.blockNum >= trToLastBlockNum);
  }

  return transfersFrom.concat(transfersTo);
}

function cutOffTrailingSameHashes(transfers: AssetTransfersWithMetadataResult[]) {
  const sameTrailingHashes = calcSameTrailingHashes(transfers);

  if (sameTrailingHashes === transfers.length)
    // (!) Leaving the list as is - this puts a limit on max batch size we display
    return transfers;

  return transfers.slice(0, -sameTrailingHashes);
}

function calcSameTrailingHashes(transfers: AssetTransfersWithMetadataResult[]) {
  if (!transfers.length) return 0;

  const trailingHash = transfers.at(-1)!.hash;
  if (transfers.at(0)!.hash === trailingHash) return transfers.length; // All are same, saving runtime

  if (transfers.length === 2) return 1; // Preposition for further math

  const sameTrailingHashes = transfers.length - 1 - transfers.findLastIndex(tr => tr.hash !== trailingHash);

  return sameTrailingHashes;
}

function sortPredicate(
  { metadata: { blockTimestamp: aTs } }: AssetTransfersWithMetadataResult,
  { metadata: { blockTimestamp: bTs } }: AssetTransfersWithMetadataResult
) {
  if (aTs < bTs) return 1;
  if (aTs > bTs) return -1;

  return 0;
}

function olderThanBlockToToBlockValue(olderThanBlockHeight: `${number}` | undefined) {
  return olderThanBlockHeight ? '0x' + (BigInt(olderThanBlockHeight) - BigInt(1)).toString(16) : undefined;
}

const GAS_CATEGORIES = [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.INTERNAL];
const ASSET_CATEGORIES = [
  AssetTransfersCategory.ERC20,
  AssetTransfersCategory.ERC721,
  AssetTransfersCategory.ERC1155,
  AssetTransfersCategory.SPECIALNFT
];

/** If included, response fails with message about category not being supported. */
const EXCLUDED_INTERNAL_CATEGORY = new Set([
  Network.OPT_MAINNET,
  Network.OPT_SEPOLIA,
  Network.MATIC_AMOY,
  Network.BNB_MAINNET,
  Network.BLAST_SEPOLIA,
  Network.ARB_SEPOLIA,
  Network.SCROLL_SEPOLIA,
  Network.BASE_SEPOLIA,
  Network.BLAST_MAINNET,
  Network.LINEA_SEPOLIA,
  Network.SCROLL_MAINNET,
  Network.AVAX_FUJI,
  Network.ARBNOVA_MAINNET,
  Network.ZKSYNC_MAINNET,
  Network.WORLDCHAIN_MAINNET,
  Network.GNOSIS_MAINNET,
  Network.SONEIUM_MINATO,
  Network.ZETACHAIN_TESTNET,
  Network.ZETACHAIN_MAINNET,
  Network.GNOSIS_CHIADO,
  Network.AVAX_MAINNET,
  Network.SHAPE_SEPOLIA,
  Network.SHAPE_MAINNET,
  Network.ZKSYNC_SEPOLIA,
  Network.ROOTSTOCK_MAINNET,
  Network.ROOTSTOCK_TESTNET,
  Network.BNB_TESTNET,
  Network.LINEA_MAINNET,
  Network.BASE_MAINNET,
  Network.ARB_MAINNET,
  Network.WORLDCHAIN_SEPOLIA
]);

const getAlchemyClient = memoizee(
  (chainId: number) => {
    const network = ALCHEMY_CHAINS_NAMES[chainId];

    if (!network) throw new CodedError(422, 'Chain not supported');

    return new Alchemy({
      apiKey: EnvVars.ALCHEMY_API_KEY,
      network,
      maxRetries: 0
    });
  },
  { max: Object.keys(Network).length }
);
