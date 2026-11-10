import { AssetTransfersWithMetadataResult } from '@temple-wallet/alchemy-sdk';
import uniqBy from 'lodash/uniqBy.js';

import { TR_PSEUDO_LIMIT } from '../constants.js';
import { fetch } from '../queued-fetch-jobs.js';

function olderThanBlockToToBlockValue(olderThanBlockHeight: `${number}` | undefined) {
  return olderThanBlockHeight ? '0x' + (BigInt(olderThanBlockHeight) - BigInt(1)).toString(16) : undefined;
}

function sortPredicate(
  { metadata: { blockTimestamp: aTs } }: AssetTransfersWithMetadataResult,
  { metadata: { blockTimestamp: bTs } }: AssetTransfersWithMetadataResult
) {
  if (aTs < bTs) return 1;
  if (aTs > bTs) return -1;

  return 0;
}

function calcSameTrailingHashes(transfers: AssetTransfersWithMetadataResult[]) {
  if (!transfers.length) return 0;

  const trailingHash = transfers.at(-1)!.hash;
  if (transfers.at(0)!.hash === trailingHash) return transfers.length; // All are same, saving runtime

  if (transfers.length === 2) return 1; // Preposition for further math

  const sameTrailingHashes = transfers.length - 1 - transfers.findLastIndex(tr => tr.hash !== trailingHash);

  return sameTrailingHashes;
}

function cutOffTrailingSameHashes(transfers: AssetTransfersWithMetadataResult[]) {
  const sameTrailingHashes = calcSameTrailingHashes(transfers);

  if (sameTrailingHashes === transfers.length)
    // (!) Leaving the list as is - this puts a limit on max batch size we display
    return transfers;

  return transfers.slice(0, -sameTrailingHashes);
}

export async function fetchTransfers(
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
