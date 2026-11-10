/** NFT row from a balances response fetched without NFT asset metadata. */
export interface CollectibleNftBalance {
  token_id: bigint;
  token_balance: bigint;
  token_price_wei: null;
}

/** Contract row from a balances response fetched without NFT asset metadata. */
export interface CollectibleBalanceItem {
  contract_address: string;
  balance: bigint;
  balance_24h: null;
  nft_data: CollectibleNftBalance[];
  last_transferred_at: Date | null;
}

export interface CollectibleAttribute {
  trait_type: string;
  value: string;
}

/** Token metadata copied onto `external_data`. Absent on the balances path. */
export interface TokenAssetMetadata {
  name: string | null;
  description: string | null;
  image: string | null;
  image256: string | null;
  image512: string | null;
  image1024: string | null;
  animationUrl: string | null;
  externalUrl: string | null;
  attributes: CollectibleAttribute[];
  mimeType: string | null;
  sizeBytes: string | null;
}

export interface TokenBalance {
  tokenId: bigint;
  balance: bigint;
  tokenUrl: string | null;
  metadata?: TokenAssetMetadata | null;
}

export interface ContractBalance {
  contractAddress: string;
  contractName: string | null;
  contractSymbol: string | null;
  supportsErc: string[];
  logoUrl: string | null;
  lastTransferredAt: Date | null;
  /** Highest Alchemy acquisition block seen for this contract. */
  blockHeight: number | null;
  isSpam: boolean;
  tokens: Map<string, TokenBalance>;
}

export interface Page<T> {
  items: readonly T[];
  next: string | null;
}

export interface AddressGroup {
  addresses: string[];
  tokenCount: number;
}

export interface OpenSeaGroup extends AddressGroup {
  slug: string;
}

export interface ContractFetchPlan {
  openSeaGroups: OpenSeaGroup[];
  alchemyGroups: AddressGroup[];
  /** Distinct token ids Alchemy reported for each contract read from OpenSea, keyed by lowercase address. */
  expectedTokenCounts: Map<string, number>;
  hybridRequests: number;
  alchemyRequests: number;
  totalTokens: number;
}

/**
 * `GET /collectibles-metadata` body (`balances_nft` `data`).
 * Dates and balances are serialized to strings by `toSerializable`.
 * `last_transfered_at` keeps GoldRush's spelling.
 */
export interface CollectiblesMetadataExternalData {
  name: string | null;
  description: string | null;
  asset_url: null;
  asset_file_extension: null;
  asset_mime_type: string | null;
  asset_size_bytes: string | null;
  image: string | null;
  image_256: string | null;
  image_512: string | null;
  image_1024: string | null;
  animation_url: string | null;
  external_url: string | null;
  attributes: CollectibleAttribute[];
  thumbnails: null;
  image_preview: null;
  asset_properties: null;
}

export interface CollectiblesMetadataNft {
  token_id: bigint;
  token_balance: bigint | null;
  token_url: string | null;
  original_owner: null;
  current_owner: null;
  external_data: CollectiblesMetadataExternalData | null;
  asset_cached: null;
  image_cached: null;
}

export interface CollectiblesMetadataItem {
  contract_name: string | null;
  contract_ticker_symbol: string | null;
  contract_address: string;
  supports_erc: string[];
  is_spam: boolean;
  block_height: number | null;
  balance: bigint;
  balance_24h: null;
  type: 'nft';
  floor_price_quote: null;
  pretty_floor_price_quote: null;
  floor_price_native_quote: null;
  last_transfered_at: Date | null;
  nft_data: CollectiblesMetadataNft[];
}

export interface CollectiblesMetadataResponse {
  address: string;
  updated_at: Date;
  next_update_at: null;
  quote_currency: 'USD';
  chain_id: number;
  chain_name: string | null;
  chain_tip_height: null;
  chain_tip_signed_at: null;
  items: CollectiblesMetadataItem[];
  pagination: {
    has_more: boolean;
    page_number: number;
    page_size: number;
    total_count: number | null;
  };
}
