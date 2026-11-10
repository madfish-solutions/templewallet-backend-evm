import { ChainID, ChainName } from '@covalenthq/client-sdk';
import memoizee from 'memoizee';

import { getCacheKey, withRedisCache } from '../../utils/cache.js';
import { ALCHEMY_CHAINS_NAMES, openseaChains } from '../../utils/chains.js';
import { CodedError } from '../../utils/errors.js';
import { Serializable, toSerializable } from '../utils.js';

import {
  loadAlchemyContracts,
  loadAlchemyTokensForContracts,
  loadOwnerContracts,
  rememberOwnerContract
} from './alchemy.js';
import { getWithMetadata, runWithCollectiblesBalancesContext } from './context.js';
import { toBalanceItems, toMetadataItems } from './contracts.js';
import { loadOpenSeaCollection, loadOpenSeaContracts } from './opensea.js';
import { ALCHEMY_CONTRACT_FILTER_LIMIT, planContractFetches } from './plan.js';
import { CollectibleBalanceItem, CollectiblesMetadataResponse, ContractBalance, ContractFetchPlan } from './types.js';

const MAX_AGE = 20_000;
const CACHE_TTL_SECONDS = 30;

const memoizeAsync = <T extends (...args: any[]) => Promise<any>>(fn: T) =>
  memoizee(fn, { promise: true, maxAge: MAX_AGE });

const toGoldrushChainId = (chainId: number): ChainID | null => {
  for (const value of Object.values(ChainID)) {
    if (value === chainId) {
      return value;
    }
  }

  return null;
};

const loadHybridContracts = async (
  walletAddress: string,
  chainId: number,
  plan: ContractFetchPlan,
  contracts = new Map<string, ContractBalance>()
) => {
  await Promise.all(
    plan.openSeaGroups
      .map(group =>
        loadOpenSeaCollection(
          walletAddress,
          chainId,
          group.slug,
          new Set(group.addresses.map(address => address.toLowerCase())),
          contracts
        )
      )
      .concat(
        plan.alchemyGroups.map(group =>
          loadAlchemyTokensForContracts(walletAddress, chainId, group.addresses, contracts)
        )
      )
  );

  // A collection slug does not cover every token id on a contract. Alchemy loads the contract
  // when OpenSea returned fewer distinct ids than `numDistinctTokensOwned`.
  const shortfall = openSeaShortfall(contracts, plan);
  await Promise.all(
    chunk(shortfall, ALCHEMY_CONTRACT_FILTER_LIMIT).map(addresses =>
      loadAlchemyTokensForContracts(walletAddress, chainId, addresses, contracts)
    )
  );

  return contracts;
};

const openSeaShortfall = (contracts: Map<string, ContractBalance>, plan: ContractFetchPlan) => {
  const shortfall: string[] = [];
  const seen = new Set<string>();

  for (const group of plan.openSeaGroups) {
    for (const address of group.addresses) {
      const key = address.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const held = contracts.get(key)?.tokens.size ?? 0;
      const expected = plan.expectedTokenCounts.get(key) ?? 0;
      if (held < expected) {
        shortfall.push(address);
      }
    }
  }

  return shortfall;
};

const chunk = <T>(items: readonly T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

/**
 * Contract list, then OpenSea by collection slug and Alchemy by contract filter.
 * Used when any contract has `openSeaMetadata.collectionSlug` and
 * contract pages + OpenSea pages (200) + filtered Alchemy pages for the other contracts
 * is no larger than one unfiltered Alchemy pass. OpenSea's account list is a different
 * inventory, so it is not used as that pass. Contracts whose collection returned fewer
 * token ids than Alchemy counted are read from Alchemy afterwards.
 */
const loadMixedContracts = async (walletAddress: string, chainId: number) => {
  const { contracts: ownerContracts, pageCount } = await loadOwnerContracts(walletAddress, chainId);
  const plan = planContractFetches(ownerContracts, pageCount);
  if (plan.totalTokens === 0) {
    return new Map<string, ContractBalance>();
  }

  const seeded = new Map<string, ContractBalance>();
  if (getWithMetadata()) {
    for (const ownerContract of ownerContracts) {
      rememberOwnerContract(seeded, ownerContract);
    }
  }

  if (plan.openSeaGroups.length > 0 && plan.hybridRequests <= plan.alchemyRequests) {
    return loadHybridContracts(walletAddress, chainId, plan, seeded);
  }

  return loadAlchemyContracts(walletAddress, chainId, seeded);
};

const loadContracts = (walletAddress: string, chainId: number) => {
  if (!(chainId in ALCHEMY_CHAINS_NAMES) && !(chainId in openseaChains)) {
    throw new CodedError(422, 'Chain not supported');
  }

  if (chainId in ALCHEMY_CHAINS_NAMES && chainId in openseaChains) {
    return loadMixedContracts(walletAddress, chainId);
  }
  if (chainId in openseaChains) {
    return loadOpenSeaContracts(walletAddress, chainId);
  }

  return loadAlchemyContracts(walletAddress, chainId);
};

interface CollectiblesBalancesResponse {
  address: string;
  chain_id: ChainID | null;
  chain_name: null;
  quote_currency: 'USD';
  updated_at: Date;
  items: CollectibleBalanceItem[];
}

const loadEvmCollectiblesBalances = async (
  walletAddress: string,
  chainId: number
): Promise<Serializable<CollectiblesBalancesResponse>> => {
  const contracts = await loadContracts(walletAddress, chainId);

  const response: CollectiblesBalancesResponse = {
    address: walletAddress,
    chain_id: toGoldrushChainId(chainId),
    chain_name: null,
    quote_currency: 'USD',
    updated_at: new Date(),
    items: toBalanceItems(contracts)
  };

  return toSerializable(response);
};

const getCachedEvmCollectiblesBalances = memoizeAsync((walletAddress: string, chainId: number, showSpam: boolean) =>
  withRedisCache(
    getCacheKey('hybrid', ['collectibles-balances', walletAddress, chainId, String(showSpam)]),
    CACHE_TTL_SECONDS,
    () => loadEvmCollectiblesBalances(walletAddress, chainId)
  )
);

export const getEvmCollectiblesBalances = (
  walletAddress: string,
  chainId: number,
  showSpam: boolean
): Promise<Serializable<CollectiblesBalancesResponse>> =>
  runWithCollectiblesBalancesContext(showSpam, () =>
    getCachedEvmCollectiblesBalances(walletAddress.toLowerCase(), chainId, showSpam)
  );

const goldrushChainIdsByKey = new Map<string, number>();
for (const [key, value] of Object.entries(ChainID)) {
  if (typeof value === 'number') {
    goldrushChainIdsByKey.set(key, value);
  }
}

const goldrushChainNames = new Map<number, string>();
for (const [key, value] of Object.entries(ChainName)) {
  const id = goldrushChainIdsByKey.get(key);
  if (id != null && typeof value === 'string') {
    goldrushChainNames.set(id, value);
  }
}

const loadEvmCollectiblesMetadata = async (
  walletAddress: string,
  chainId: number
): Promise<Serializable<CollectiblesMetadataResponse>> => {
  const contracts = await loadContracts(walletAddress, chainId);
  const items = toMetadataItems(contracts);
  const response: CollectiblesMetadataResponse = {
    address: walletAddress,
    updated_at: new Date(),
    next_update_at: null,
    quote_currency: 'USD',
    chain_id: chainId,
    chain_name: goldrushChainNames.get(chainId) ?? null,
    chain_tip_height: null,
    chain_tip_signed_at: null,
    items,
    pagination: {
      has_more: false,
      page_number: 0,
      page_size: items.length,
      total_count: items.length
    }
  };

  return toSerializable(response);
};

const getCachedEvmCollectiblesMetadataV2 = memoizeAsync((walletAddress: string, chainId: number, showSpam: boolean) =>
  withRedisCache(
    getCacheKey('hybrid', ['collectibles-metadata', walletAddress, chainId, String(showSpam)]),
    CACHE_TTL_SECONDS,
    () => loadEvmCollectiblesMetadata(walletAddress, chainId)
  )
);

export const getEvmCollectiblesMetadataV2 = (
  walletAddress: string,
  chainId: number,
  showSpam: boolean
): Promise<Serializable<CollectiblesMetadataResponse>> =>
  runWithCollectiblesBalancesContext(
    showSpam,
    () => getCachedEvmCollectiblesMetadataV2(walletAddress.toLowerCase(), chainId, showSpam),
    true
  );
