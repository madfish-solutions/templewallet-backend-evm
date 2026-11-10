import { isAddress } from 'viem';

import { type OpenseaAccountNft, getAccountNfts } from '../collectibles-v2/opensea.js';

import { getWithMetadata } from './context.js';
import { addToken, fillContract, getContract } from './contracts.js';
import { ContractBalance, TokenAssetMetadata } from './types.js';
import {
  collectPages,
  firstNonEmpty,
  normalizeAttributes,
  parseInteger,
  sizedImageUrlsFrom,
  supportsErcFromStandard
} from './utils.js';

const openSeaTokenMetadata = (nft: OpenseaAccountNft): TokenAssetMetadata => ({
  name: nft.name ?? null,
  description: nft.description ?? null,
  image: firstNonEmpty(nft.originalImageUrl, nft.imageUrl, nft.displayImageUrl),
  ...sizedImageUrlsFrom(nft.displayImageUrl, nft.imageUrl, nft.originalImageUrl),
  animationUrl: firstNonEmpty(nft.originalAnimationUrl, nft.displayAnimationUrl, nft.animationUrl),
  externalUrl: null,
  attributes: normalizeAttributes(nft.traits),
  mimeType: null,
  sizeBytes: null
});

const addOpenSeaNft = (
  contracts: Map<string, ContractBalance>,
  nft: OpenseaAccountNft,
  allowedAddresses?: ReadonlySet<string>
) => {
  if (!isAddress(nft.contract)) {
    return;
  }
  if (allowedAddresses != null && !allowedAddresses.has(nft.contract.toLowerCase())) {
    return;
  }

  const tokenId = parseInteger(nft.identifier);
  const balance = parseInteger(nft.quantityString);
  const supportsErc = supportsErcFromStandard(nft.tokenStandard);
  if (tokenId == null || balance == null || supportsErc[0] === 'erc20') {
    return;
  }

  const contract = getContract(contracts, nft.contract);
  const withMetadata = getWithMetadata();
  if (withMetadata) {
    fillContract(contract, { supportsErc });
  }
  addToken(contract, {
    tokenId,
    balance,
    tokenUrl: withMetadata ? firstNonEmpty(nft.metadataUrl) : null,
    metadata: withMetadata ? openSeaTokenMetadata(nft) : null
  });
};

export const loadOpenSeaContracts = async (walletAddress: string, chainId: number) => {
  const contracts = new Map<string, ContractBalance>();
  const nfts = await collectPages(async cursor => {
    const page = await getAccountNfts(walletAddress, chainId, undefined, cursor);

    return { items: page.nfts, next: page.next };
  });

  for (const nft of nfts) {
    addOpenSeaNft(contracts, nft);
  }

  return contracts;
};

export const loadOpenSeaCollection = async (
  walletAddress: string,
  chainId: number,
  slug: string,
  allowedAddresses: ReadonlySet<string>,
  contracts: Map<string, ContractBalance>
) => {
  const nfts = await collectPages(async cursor => {
    const page = await getAccountNfts(walletAddress, chainId, slug, cursor);

    return { items: page.nfts, next: page.next };
  });

  for (const nft of nfts) {
    addOpenSeaNft(contracts, nft, allowedAddresses);
  }
};
