import { AssetTransfersCategory, Network } from '@temple-wallet/alchemy-sdk';

import { ALCHEMY_CHAINS_NAMES } from '../../utils/chains.js';

import { AlchemyQueueJobName } from './types.js';

export const GAS_CATEGORIES = [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.INTERNAL];
export const ASSET_CATEGORIES = [
  AssetTransfersCategory.ERC20,
  AssetTransfersCategory.ERC721,
  AssetTransfersCategory.ERC1155,
  AssetTransfersCategory.SPECIALNFT
];

/** `alchemy_getAssetTransfers` rejects `internal` on these networks. Ethereum, Polygon, Base, and Arc accept it. */
export const EXCLUDED_INTERNAL_CATEGORY = new Set<string>([
  Network.OPT_MAINNET,
  Network.ROOTSTOCK_MAINNET,
  Network.ROOTSTOCK_TESTNET,
  Network.BNB_MAINNET,
  Network.BNB_TESTNET,
  Network.GNOSIS_MAINNET,
  Network.UNICHAIN_MAINNET,
  Network.MONAD_MAINNET,
  Network.OPBNB_MAINNET,
  Network.ZKSYNC_SEPOLIA,
  Network.ZKSYNC_MAINNET,
  Network.SHAPE_MAINNET,
  Network.WORLDCHAIN_MAINNET,
  Network.ASTAR_MAINNET,
  Network.FLOW_MAINNET,
  Network.STABLE_MAINNET,
  Network.HYPERLIQUID_MAINNET,
  Network.METIS_MAINNET,
  Network.POLYGONZKEVM_MAINNET,
  Network.SEI_MAINNET,
  Network.STORY_MAINNET,
  Network.SONEIUM_MAINNET,
  Network.SONEIUM_MINATO,
  Network.RONIN_MAINNET,
  Network.POLYGONZKEVM_CARDONA,
  Network.ABSTRACT_MAINNET,
  Network.MEGAETH_MAINNET,
  Network.ROBINHOOD_MAINNET,
  Network.ROBINHOOD_TESTNET,
  Network.WORLDCHAIN_SEPOLIA,
  Network.MANTLE_MAINNET,
  Network.MANTLE_SEPOLIA,
  Network.OPBNB_TESTNET,
  Network.ZETACHAIN_MAINNET,
  Network.ZETACHAIN_TESTNET,
  Network.GNOSIS_CHIADO,
  Network.SHAPE_SEPOLIA,
  Network.APECHAIN_MAINNET,
  Network.ARB_MAINNET,
  Network.CELO_MAINNET,
  Network.AVAX_FUJI,
  Network.AVAX_MAINNET,
  Network.CELO_ALFAJORES,
  Network.INK_MAINNET,
  Network.LINEA_SEPOLIA,
  Network.LINEA_MAINNET,
  Network.ANIME_MAINNET,
  Network.MATIC_AMOY,
  Network.BERACHAIN_MAINNET,
  Network.BLAST_MAINNET,
  Network.BASE_SEPOLIA,
  Network.ARB_SEPOLIA,
  Network.SCROLL_MAINNET,
  Network.GENSYN_TESTNET,
  Network.ZORA_MAINNET,
  Network.OPT_SEPOLIA,
  Network.RISE_TESTNET,
  Network.BLAST_SEPOLIA
]);

export const ETH_TOKEN_SLUG = 'eth' as const;
export const TR_PSEUDO_LIMIT = 50;
export const APPROVALS_REQUESTS_LIMIT_PER_TXS_REQUEST = 3;
export const CACHE_TTLS = {
  transactions: 10,
  lastTransferTimestamp: 10,
  nftsForOwner: 10
} as const;
export const alchemyRequestsCosts: Record<AlchemyQueueJobName, number> = {
  assetTransfers: 120,
  approvals: 60,
  nftsForOwner: 480,
  contractsForOwner: 320
};
export const ALCHEMY_CLIENTS_CACHE_SIZE = Object.keys(ALCHEMY_CHAINS_NAMES).length;
export const BLOCK_RANGE_ERROR_REGEX = /You can make eth_getLogs requests with up to a (\d+) block range./;
