import {
  Alchemy,
  AssetTransfersCategory,
  Network,
  AssetTransfersWithMetadataParams,
  SortingOrder,
  AssetTransfersWithMetadataResult,
  Log
} from 'alchemy-sdk';
import { uniqBy, range } from 'lodash';
import memoizee from 'memoizee';

import { EnvVars } from '../config';
import { CodedError } from '../utils/errors';

const ETH_TOKEN_SLUG = 'eth' as const;
const TR_PSEUDO_LIMIT = 50;

const BLOCK_RANGE_ERROR_REGEX = /You can make eth_getLogs requests with up to a (\d+) block range./;

export async function fetchTransactions(
  chainId: number,
  accAddress: string,
  contractAddress?: string,
  olderThanBlockHeight?: `${number}`
) {
  const alchemy = getAlchemyClient(chainId);

  const transfers = await fetchTransfers(alchemy, accAddress, contractAddress, olderThanBlockHeight);

  if (!transfers.length || contractAddress === ETH_TOKEN_SLUG) {
    return { transfers, approvals: [] };
  }

  let approvals: Log[] = [];
  const highestBlockNum = transfers.at(0)!.blockNum;
  const lowestBlockNum = transfers.at(-1)!.blockNum;

  try {
    approvals = await fetchApprovals(alchemy, accAddress, contractAddress, highestBlockNum, lowestBlockNum);
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
    if (requestsCountForAllBlocks <= transfers.length) {
      blocksRanges = range(parsedLowestBlockNum, parsedHighestBlockNum + 1, blockRange).map(fromBlock => [
        fromBlock,
        fromBlock + blockRange - 1
      ]);
    } else {
      blocksRanges = transfers
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
        fetchApprovals(alchemy, accAddress, contractAddress, `0x${toBlock.toString(16)}`, `0x${fromBlock.toString(16)}`)
      )
    );
    approvals = uniqBy(approvalsChunks.flat(), log => `${log.transactionHash}-${log.logIndex}`);
  }

  return { transfers, approvals };
}

async function fetchTransfers(
  alchemy: Alchemy,
  accAddress: string,
  /** Without token ID means ERC-20 tokens only */
  contractAddress?: string,
  olderThanBlockHeight?: `${number}`
): Promise<AssetTransfersWithMetadataResult[]> {
  const toBlock = olderThanBlockToToBlockValue(olderThanBlockHeight);

  const [transfersFrom, transfersTo] = await Promise.all([
    _fetchTransfers(alchemy, accAddress, contractAddress, false, toBlock),
    _fetchTransfers(alchemy, accAddress, contractAddress, true, toBlock)
  ]);

  const allTransfers = mergeFetchedTransfers(transfersFrom, transfersTo);

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

async function _fetchTransfers(
  alchemy: Alchemy,
  accAddress: string,
  contractAddress: string | undefined,
  toAcc: boolean,
  toBlock: string | undefined
) {
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

  // Alchemy SDK processes Error 429 itself. See: https://docs.alchemy.com/reference/throughput#option-1-alchemy-sdk
  return alchemy.core.getAssetTransfers(reqOptions).then(r => r.transfers);
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

async function fetchApprovals(
  alchemy: Alchemy,
  accAddress: string,
  contractAddress: string | undefined,
  /** Hex string. Including said block. */
  toBlock: string,
  /** Hex string. Including said block. */
  fromBlock: string
) {
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
  } catch (error: any) {
    // For 'query exceeds max block range ...' // Range may differ for different chains
    if (error?.error?.code === -32602) return [];

    throw error;
  }
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

/** TODO: Verify this mapping */
const CHAINS_NAMES: Record<number, Network> = {
  1: Network.ETH_MAINNET,
  5: Network.ETH_GOERLI,
  10: Network.OPT_MAINNET,
  30: Network.ROOTSTOCK_MAINNET,
  31: Network.ROOTSTOCK_TESTNET,
  56: Network.BNB_MAINNET,
  97: Network.BNB_TESTNET,
  100: Network.GNOSIS_MAINNET,
  137: Network.MATIC_MAINNET,
  204: Network.OPBNB_MAINNET,
  250: Network.FANTOM_MAINNET,
  300: Network.ZKSYNC_SEPOLIA,
  324: Network.ZKSYNC_MAINNET,
  360: Network.SHAPE_MAINNET,
  420: Network.OPT_GOERLI,
  480: Network.WORLDCHAIN_MAINNET,
  592: Network.ASTAR_MAINNET,
  1088: Network.METIS_MAINNET,
  1101: Network.POLYGONZKEVM_MAINNET,
  1442: Network.POLYGONZKEVM_TESTNET,
  1946: Network.SONEIUM_MINATO,
  2442: Network.POLYGONZKEVM_CARDONA,
  4002: Network.FANTOM_TESTNET,
  4801: Network.WORLDCHAIN_SEPOLIA,
  5000: Network.MANTLE_MAINNET,
  5003: Network.MANTLE_SEPOLIA,
  5611: Network.OPBNB_TESTNET,
  7000: Network.ZETACHAIN_MAINNET,
  7001: Network.ZETACHAIN_TESTNET,
  8453: Network.BASE_MAINNET,
  10200: Network.GNOSIS_CHIADO,
  11011: Network.SHAPE_SEPOLIA,
  42161: Network.ARB_MAINNET,
  42220: Network.CELO_MAINNET,
  43113: Network.AVAX_FUJI,
  43114: Network.AVAX_MAINNET,
  42170: Network.ARBNOVA_MAINNET,
  44787: Network.CELO_ALFAJORES,
  59141: Network.LINEA_SEPOLIA,
  59144: Network.LINEA_MAINNET,
  80001: Network.MATIC_MUMBAI,
  80002: Network.MATIC_AMOY,
  80084: Network.BERACHAIN_BARTIO,
  81457: Network.BLAST_MAINNET,
  84531: Network.BASE_GOERLI,
  84532: Network.BASE_SEPOLIA,
  421613: Network.ARB_GOERLI,
  421614: Network.ARB_SEPOLIA,
  534351: Network.SCROLL_SEPOLIA,
  534352: Network.SCROLL_MAINNET,
  11155111: Network.ETH_SEPOLIA,
  11155420: Network.OPT_SEPOLIA,
  168587773: Network.BLAST_SEPOLIA
};

const getAlchemyClient = memoizee(
  (chainId: number) => {
    const network = CHAINS_NAMES[chainId];

    if (!network) throw new CodedError(422, 'Chain not supported');

    return new Alchemy({
      apiKey: EnvVars.ALCHEMY_API_KEY,
      network,
      maxRetries: 50
    });
  },
  { max: Object.keys(Network).length }
);
