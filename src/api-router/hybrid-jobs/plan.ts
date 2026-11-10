import { NftContractForOwner, NftTokenType } from '@temple-wallet/alchemy-sdk';
import { isAddress } from 'viem';

import { getShowSpam } from './context.js';
import { AddressGroup, ContractFetchPlan, OpenSeaGroup } from './types.js';
import { parseInteger } from './utils.js';

const ALCHEMY_NFT_PAGE_SIZE = 100;
/** `getNftsForOwner` accepts at most 20 contract addresses. */
export const ALCHEMY_CONTRACT_FILTER_LIMIT = 20;
const OPENSEA_ACCOUNT_PAGE_SIZE = 200;

const pageCountFor = (itemCount: number, pageSize: number) => {
  if (!Number.isFinite(itemCount) || itemCount <= 0) {
    return itemCount > 0 ? Number.MAX_SAFE_INTEGER : 0;
  }

  return Math.ceil(itemCount / pageSize);
};

const addCount = (current: number, next: number) => Math.min(current + next, Number.MAX_SAFE_INTEGER);

/** Distinct token ids owned. Page counts use this, not `totalBalance` (ERC-1155 amounts). */
const distinctTokenCount = (value: string) => {
  const parsed = parseInteger(value);
  if (parsed == null) {
    return 1;
  }
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(parsed);
};

/**
 * Pack contract filters into groups of at most 20. `getNftsForOwner` pages those groups
 * together, so a contract is placed where it adds the fewest extra pages.
 */
const packAlchemyGroups = (contracts: Array<{ address: string; tokenCount: number }>): AddressGroup[] => {
  const sorted = [...contracts].sort((left, right) => right.tokenCount - left.tokenCount);
  const groups: AddressGroup[] = [];

  for (const contract of sorted) {
    let bestGroup: AddressGroup | undefined;
    let bestIncrease = Number.POSITIVE_INFINITY;

    for (const group of groups) {
      if (group.addresses.length >= ALCHEMY_CONTRACT_FILTER_LIMIT) {
        continue;
      }

      const increase =
        pageCountFor(addCount(group.tokenCount, contract.tokenCount), ALCHEMY_NFT_PAGE_SIZE) -
        pageCountFor(group.tokenCount, ALCHEMY_NFT_PAGE_SIZE);
      if (increase < bestIncrease) {
        bestIncrease = increase;
        bestGroup = group;
      }
    }

    if (bestGroup == null) {
      groups.push({ addresses: [contract.address], tokenCount: contract.tokenCount });
      continue;
    }

    bestGroup.addresses.push(contract.address);
    bestGroup.tokenCount = addCount(bestGroup.tokenCount, contract.tokenCount);
  }

  return groups;
};

export const planContractFetches = (
  ownerContracts: NftContractForOwner[],
  contractPages: number
): ContractFetchPlan => {
  const slugGroups = new Map<string, OpenSeaGroup>();
  const alchemyContracts: Array<{ address: string; tokenCount: number }> = [];
  const seenAddresses = new Set<string>();
  const expectedTokenCounts = new Map<string, number>();
  let totalTokens = 0;

  for (const ownerContract of ownerContracts) {
    if (
      (ownerContract.isSpam && !getShowSpam()) ||
      ownerContract.tokenType === NftTokenType.NOT_A_CONTRACT ||
      !isAddress(ownerContract.address)
    ) {
      continue;
    }

    const tokenCount = distinctTokenCount(ownerContract.numDistinctTokensOwned);
    if (tokenCount === 0) {
      continue;
    }

    const addressKey = ownerContract.address.toLowerCase();
    if (seenAddresses.has(addressKey)) {
      continue;
    }
    seenAddresses.add(addressKey);

    totalTokens = addCount(totalTokens, tokenCount);
    const slug = ownerContract.openSeaMetadata?.collectionSlug;
    if (slug != null && slug !== '') {
      const group = slugGroups.get(slug) ?? { slug, addresses: [], tokenCount: 0 };
      group.addresses.push(ownerContract.address);
      group.tokenCount = addCount(group.tokenCount, tokenCount);
      slugGroups.set(slug, group);
      expectedTokenCounts.set(addressKey, tokenCount);
      continue;
    }

    alchemyContracts.push({ address: ownerContract.address, tokenCount });
  }

  const openSeaGroups = Array.from(slugGroups.values());
  const alchemyGroups = packAlchemyGroups(alchemyContracts);
  const openSeaPages = openSeaGroups.reduce(
    (sum, group) => sum + pageCountFor(group.tokenCount, OPENSEA_ACCOUNT_PAGE_SIZE),
    0
  );
  const alchemyFilteredPages = alchemyGroups.reduce(
    (sum, group) => sum + pageCountFor(group.tokenCount, ALCHEMY_NFT_PAGE_SIZE),
    0
  );

  return {
    openSeaGroups,
    alchemyGroups,
    expectedTokenCounts,
    hybridRequests: contractPages + openSeaPages + alchemyFilteredPages,
    alchemyRequests: pageCountFor(totalTokens, ALCHEMY_NFT_PAGE_SIZE),
    totalTokens
  };
};
