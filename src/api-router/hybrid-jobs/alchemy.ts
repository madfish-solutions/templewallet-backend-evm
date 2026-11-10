import { NftContractForOwner, NftFilters, NftOrdering, OwnedBaseNft, OwnedNft } from '@temple-wallet/alchemy-sdk';
import { isAddress } from 'viem';

import { fetchEvmCollectibles, fetchEvmCollectiblesContracts } from '../alchemy/index.js';

import { getShowSpam, getWithMetadata } from './context.js';
import { addToken, fillContract, getContract } from './contracts.js';
import { ContractBalance, TokenAssetMetadata } from './types.js';
import {
  collectPages,
  firstNonEmpty,
  normalizeAttributes,
  parseDate,
  parseInteger,
  sizedImageUrlsFrom,
  supportsErcFromTokenType
} from './utils.js';

/** Omitted when the caller asked for spam, so Alchemy applies no spam exclusion. */
const excludeSpam = () => (getShowSpam() ? {} : { excludeFilters: [NftFilters.SPAM] });

const alchemyTokenMetadata = (nft: OwnedNft): TokenAssetMetadata => {
  const rawMetadata = nft.raw?.metadata;
  const size = nft.image?.size ?? nft.animation?.size;

  const image = firstNonEmpty(nft.image?.originalUrl, nft.image?.cachedUrl);

  return {
    name: nft.name ?? null,
    description: nft.description ?? null,
    image,
    ...sizedImageUrlsFrom(nft.image?.originalUrl, nft.image?.cachedUrl, nft.image?.thumbnailUrl),
    animationUrl: firstNonEmpty(nft.animation?.originalUrl, nft.animation?.cachedUrl),
    externalUrl: firstNonEmpty(
      typeof rawMetadata?.external_url === 'string' ? rawMetadata.external_url : null,
      typeof rawMetadata?.externalUrl === 'string' ? rawMetadata.externalUrl : null,
      nft.collection?.externalUrl
    ),
    attributes: normalizeAttributes(rawMetadata?.attributes),
    mimeType: firstNonEmpty(nft.image?.contentType, nft.animation?.contentType),
    sizeBytes: typeof size === 'number' && Number.isFinite(size) ? String(size) : null
  };
};

const addAlchemyNft = (contracts: Map<string, ContractBalance>, nft: OwnedNft | OwnedBaseNft) => {
  const tokenId = parseInteger(nft.tokenId);
  const balance = parseInteger(nft.balance);
  if (tokenId == null || balance == null) {
    return;
  }

  if (!('contract' in nft)) {
    if (!isAddress(nft.contractAddress)) {
      return;
    }

    addToken(getContract(contracts, nft.contractAddress), { tokenId, balance, tokenUrl: null });

    return;
  }

  if (!isAddress(nft.contract.address) || (nft.contract.isSpam === true && !getShowSpam())) {
    return;
  }

  const contract = getContract(contracts, nft.contract.address);
  const blockHeight = nft.acquiredAt?.blockNumber;
  const withMetadata = getWithMetadata();
  fillContract(contract, {
    lastTransferredAt: parseDate(nft.acquiredAt?.blockTimestamp),
    ...(withMetadata
      ? {
          name: firstNonEmpty(nft.contract.name, nft.collection?.name),
          symbol: nft.contract.symbol ?? null,
          supportsErc: supportsErcFromTokenType(nft.tokenType),
          logoUrl: nft.contract.openSeaMetadata?.imageUrl ?? null,
          isSpam: nft.contract.isSpam,
          blockHeight: typeof blockHeight === 'number' && Number.isFinite(blockHeight) ? blockHeight : null
        }
      : {})
  });
  addToken(contract, {
    tokenId,
    balance,
    tokenUrl: withMetadata ? firstNonEmpty(nft.tokenUri, nft.raw?.tokenUri) : null,
    metadata: withMetadata ? alchemyTokenMetadata(nft) : null
  });
};

export const loadAlchemyContracts = async (
  walletAddress: string,
  chainId: number,
  contracts = new Map<string, ContractBalance>()
) => {
  const nfts = await collectPages<OwnedNft | OwnedBaseNft>(
    async cursor => {
      const page = await fetchEvmCollectibles({
        accAddress: walletAddress,
        chainId,
        pageKey: cursor,
        withMetadata: true,
        ...excludeSpam(),
        orderBy: NftOrdering.TRANSFERTIME
      });

      return { items: page.ownedNfts, next: page.pageKey ?? null };
    },
    { continueOnEmpty: true }
  );

  for (const nft of nfts) {
    addAlchemyNft(contracts, nft);
  }

  return contracts;
};

export const rememberOwnerContract = (contracts: Map<string, ContractBalance>, ownerContract: NftContractForOwner) => {
  if (!isAddress(ownerContract.address)) {
    return;
  }

  const contract = getContract(contracts, ownerContract.address);
  fillContract(contract, {
    name: ownerContract.name ?? ownerContract.openSeaMetadata?.collectionName ?? null,
    symbol: ownerContract.symbol ?? null,
    supportsErc: supportsErcFromTokenType(ownerContract.tokenType),
    logoUrl: ownerContract.openSeaMetadata?.imageUrl ?? null,
    isSpam: ownerContract.isSpam
  });
};

export const loadOwnerContracts = async (walletAddress: string, chainId: number) => {
  let pageCount = 0;
  const contracts = await collectPages<NftContractForOwner>(async cursor => {
    pageCount += 1;
    const page = await fetchEvmCollectiblesContracts({
      accAddress: walletAddress,
      chainId,
      pageKey: cursor,
      ...excludeSpam()
    });

    return { items: page.contracts, next: page.pageKey ?? null };
  });

  return { contracts, pageCount };
};

export const loadAlchemyTokensForContracts = async (
  walletAddress: string,
  chainId: number,
  addresses: string[],
  contracts: Map<string, ContractBalance>
) => {
  const nfts = await collectPages<OwnedNft | OwnedBaseNft>(
    async cursor => {
      const page = await fetchEvmCollectibles({
        accAddress: walletAddress,
        chainId,
        contractAddresses: addresses,
        pageKey: cursor,
        withMetadata: true,
        ...excludeSpam(),
        orderBy: NftOrdering.TRANSFERTIME
      });

      return { items: page.ownedNfts, next: page.pageKey ?? null };
    },
    { continueOnEmpty: true }
  );

  for (const nft of nfts) {
    addAlchemyNft(contracts, nft);
  }
};
