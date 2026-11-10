import {
  CollectibleBalanceItem,
  CollectiblesMetadataExternalData,
  CollectiblesMetadataItem,
  ContractBalance,
  TokenAssetMetadata,
  TokenBalance
} from './types.js';

export const getContract = (contracts: Map<string, ContractBalance>, contractAddress: string): ContractBalance => {
  const key = contractAddress.toLowerCase();
  const existing = contracts.get(key);
  if (existing) {
    return existing;
  }

  const created: ContractBalance = {
    contractAddress,
    contractName: null,
    contractSymbol: null,
    supportsErc: [],
    logoUrl: null,
    lastTransferredAt: null,
    blockHeight: null,
    isSpam: false,
    tokens: new Map()
  };
  contracts.set(key, created);

  return created;
};

export const fillContract = (
  contract: ContractBalance,
  metadata: {
    name?: string | null;
    symbol?: string | null;
    supportsErc?: string[];
    logoUrl?: string | null;
    lastTransferredAt?: Date | null;
    blockHeight?: number | null;
    isSpam?: boolean;
  }
) => {
  if (contract.contractName == null && metadata.name != null && metadata.name !== '') {
    contract.contractName = metadata.name;
  }
  if (contract.contractSymbol == null && metadata.symbol != null && metadata.symbol !== '') {
    contract.contractSymbol = metadata.symbol;
  }
  if (contract.supportsErc.length === 0 && metadata.supportsErc != null && metadata.supportsErc.length > 0) {
    contract.supportsErc = metadata.supportsErc;
  }
  if (contract.logoUrl == null && metadata.logoUrl != null && metadata.logoUrl !== '') {
    contract.logoUrl = metadata.logoUrl;
  }
  if (
    metadata.lastTransferredAt != null &&
    (contract.lastTransferredAt == null || metadata.lastTransferredAt > contract.lastTransferredAt)
  ) {
    contract.lastTransferredAt = metadata.lastTransferredAt;
  }
  if (metadata.blockHeight != null && (contract.blockHeight == null || metadata.blockHeight > contract.blockHeight)) {
    contract.blockHeight = metadata.blockHeight;
  }
  if (metadata.isSpam === true) {
    contract.isSpam = true;
  }
};

const fillAssetMetadata = (target: TokenAssetMetadata, source: TokenAssetMetadata) => {
  target.name ??= source.name;
  target.description ??= source.description;
  target.image ??= source.image;
  target.image256 ??= source.image256;
  target.image512 ??= source.image512;
  target.image1024 ??= source.image1024;
  target.animationUrl ??= source.animationUrl;
  target.externalUrl ??= source.externalUrl;
  target.mimeType ??= source.mimeType;
  target.sizeBytes ??= source.sizeBytes;
  if (target.attributes.length === 0 && source.attributes.length > 0) {
    target.attributes = source.attributes;
  }
};

export const addToken = (contract: ContractBalance, token: TokenBalance) => {
  if (token.balance <= 0n) {
    return;
  }

  const key = token.tokenId.toString();
  const existing = contract.tokens.get(key);
  if (existing) {
    existing.tokenUrl ??= token.tokenUrl;
    if (token.metadata != null) {
      if (existing.metadata == null) {
        existing.metadata = token.metadata;
      } else {
        fillAssetMetadata(existing.metadata, token.metadata);
      }
    }

    return;
  }

  contract.tokens.set(key, {
    tokenId: token.tokenId,
    balance: token.balance,
    tokenUrl: token.tokenUrl,
    metadata: token.metadata ?? null
  });
};

export const toBalanceItems = (contracts: Map<string, ContractBalance>): CollectibleBalanceItem[] => {
  const items: CollectibleBalanceItem[] = [];

  for (const contract of contracts.values()) {
    if (contract.tokens.size === 0) {
      continue;
    }

    let balance = 0n;
    const nftData: CollectibleBalanceItem['nft_data'] = [];
    for (const token of contract.tokens.values()) {
      balance += token.balance;
      nftData.push({
        token_id: token.tokenId,
        token_balance: token.balance,
        token_price_wei: null
      });
    }

    items.push({
      contract_address: contract.contractAddress,
      balance,
      balance_24h: null,
      nft_data: nftData,
      last_transferred_at: contract.lastTransferredAt
    });
  }

  return items;
};

const toExternalData = (metadata: TokenAssetMetadata | null | undefined): CollectiblesMetadataExternalData | null => {
  if (
    metadata == null ||
    (metadata.name == null &&
      metadata.description == null &&
      metadata.image == null &&
      metadata.image256 == null &&
      metadata.image512 == null &&
      metadata.image1024 == null &&
      metadata.animationUrl == null &&
      metadata.externalUrl == null &&
      metadata.mimeType == null &&
      metadata.sizeBytes == null &&
      metadata.attributes.length === 0)
  ) {
    return null;
  }

  return {
    name: metadata.name,
    description: metadata.description,
    asset_url: null,
    asset_file_extension: null,
    asset_mime_type: metadata.mimeType,
    asset_size_bytes: metadata.sizeBytes,
    image: metadata.image,
    image_256: metadata.image256,
    image_512: metadata.image512,
    image_1024: metadata.image1024,
    animation_url: metadata.animationUrl,
    external_url: metadata.externalUrl,
    attributes: metadata.attributes,
    thumbnails: null,
    image_preview: null,
    asset_properties: null
  };
};

export const toMetadataItems = (contracts: Map<string, ContractBalance>): CollectiblesMetadataItem[] => {
  const items: CollectiblesMetadataItem[] = [];

  for (const contract of contracts.values()) {
    if (contract.tokens.size === 0) {
      continue;
    }

    let balance = 0n;
    const nftData: CollectiblesMetadataItem['nft_data'] = [];
    for (const token of contract.tokens.values()) {
      balance += token.balance;
      nftData.push({
        token_id: token.tokenId,
        token_balance: token.balance,
        token_url: token.tokenUrl,
        original_owner: null,
        current_owner: null,
        external_data: toExternalData(token.metadata),
        asset_cached: null,
        image_cached: null
      });
    }

    items.push({
      contract_name: contract.contractName,
      contract_ticker_symbol: contract.contractSymbol,
      contract_address: contract.contractAddress,
      supports_erc: contract.supportsErc,
      is_spam: contract.isSpam,
      block_height: contract.blockHeight,
      balance,
      balance_24h: null,
      type: 'nft',
      floor_price_quote: null,
      pretty_floor_price_quote: null,
      floor_price_native_quote: null,
      last_transfered_at: contract.lastTransferredAt,
      nft_data: nftData
    });
  }

  return items;
};
