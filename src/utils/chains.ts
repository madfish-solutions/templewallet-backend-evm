import { gensynTestnet } from '@alchemy/common/chains';
import { Chain as OpenseaChain } from '@opensea/sdk/viem';
import { Network } from '@temple-wallet/alchemy-sdk';
import * as ViemChains from 'viem/chains';

import { animeChain } from './viem-patch.js';

export const ALCHEMY_CHAINS_NAMES = {
  1: Network.ETH_MAINNET,
  10: Network.OPT_MAINNET,
  30: Network.ROOTSTOCK_MAINNET,
  31: Network.ROOTSTOCK_TESTNET,
  56: Network.BNB_MAINNET,
  97: Network.BNB_TESTNET,
  100: Network.GNOSIS_MAINNET,
  130: Network.UNICHAIN_MAINNET,
  137: Network.MATIC_MAINNET,
  143: Network.MONAD_MAINNET,
  204: Network.OPBNB_MAINNET,
  300: Network.ZKSYNC_SEPOLIA,
  324: Network.ZKSYNC_MAINNET,
  360: Network.SHAPE_MAINNET,
  480: Network.WORLDCHAIN_MAINNET,
  592: Network.ASTAR_MAINNET,
  747: Network.FLOW_MAINNET,
  988: Network.STABLE_MAINNET,
  999: Network.HYPERLIQUID_MAINNET,
  1088: Network.METIS_MAINNET,
  1101: Network.POLYGONZKEVM_MAINNET,
  1329: Network.SEI_MAINNET,
  1514: Network.STORY_MAINNET,
  1868: Network.SONEIUM_MAINNET,
  1946: Network.SONEIUM_MINATO,
  2020: Network.RONIN_MAINNET,
  2442: Network.POLYGONZKEVM_CARDONA,
  2741: Network.ABSTRACT_MAINNET,
  4326: Network.MEGAETH_MAINNET,
  4663: Network.ROBINHOOD_MAINNET,
  4801: Network.WORLDCHAIN_SEPOLIA,
  5000: Network.MANTLE_MAINNET,
  5003: Network.MANTLE_SEPOLIA,
  5042: Network.ARC_MAINNET,
  5611: Network.OPBNB_TESTNET,
  7000: Network.ZETACHAIN_MAINNET,
  7001: Network.ZETACHAIN_TESTNET,
  8453: Network.BASE_MAINNET,
  10200: Network.GNOSIS_CHIADO,
  11011: Network.SHAPE_SEPOLIA,
  33139: Network.APECHAIN_MAINNET,
  42161: Network.ARB_MAINNET,
  42220: Network.CELO_MAINNET,
  43113: Network.AVAX_FUJI,
  43114: Network.AVAX_MAINNET,
  44787: Network.CELO_ALFAJORES,
  46630: Network.ROBINHOOD_TESTNET,
  57073: Network.INK_MAINNET,
  59141: Network.LINEA_SEPOLIA,
  59144: Network.LINEA_MAINNET,
  69000: Network.ANIME_MAINNET,
  80002: Network.MATIC_AMOY,
  80094: Network.BERACHAIN_MAINNET,
  81457: Network.BLAST_MAINNET,
  84532: Network.BASE_SEPOLIA,
  421614: Network.ARB_SEPOLIA,
  534352: Network.SCROLL_MAINNET,
  685685: Network.GENSYN_TESTNET,
  7777777: Network.ZORA_MAINNET,
  11155111: Network.ETH_SEPOLIA,
  11155420: Network.OPT_SEPOLIA,
  11155931: Network.RISE_TESTNET,
  168587773: Network.BLAST_SEPOLIA
};

export type EvmOpenseaChain = Exclude<OpenseaChain, OpenseaChain.Solana | OpenseaChain.Hyperliquid>;
export const openseaChains: Record<number, EvmOpenseaChain> = {
  1: OpenseaChain.Mainnet,
  137: OpenseaChain.Polygon,
  8453: OpenseaChain.Base,
  81457: OpenseaChain.Blast,
  42161: OpenseaChain.Arbitrum,
  43114: OpenseaChain.Avalanche,
  10: OpenseaChain.Optimism,
  7777777: OpenseaChain.Zora,
  1329: OpenseaChain.Sei,
  8333: OpenseaChain.B3,
  80094: OpenseaChain.BeraChain,
  33139: OpenseaChain.ApeChain,
  747: OpenseaChain.Flow,
  2020: OpenseaChain.Ronin,
  2741: OpenseaChain.Abstract,
  360: OpenseaChain.Shape,
  130: OpenseaChain.Unichain,
  43419: OpenseaChain.Gunzilla,
  999: OpenseaChain.HyperEVM,
  5031: OpenseaChain.Somnia,
  143: OpenseaChain.Monad,
  4326: OpenseaChain.MegaETH,
  1868: OpenseaChain.Soneium,
  69000: OpenseaChain.AnimeChain,
  57073: OpenseaChain.Ink,
  4663: OpenseaChain.Robinhood,
  988: OpenseaChain.StableChain,
  5042: OpenseaChain.Arc
};

const withRpcUrls = <C extends ViemChains.Chain>(chain: C, rpcUrls: string[]): C => ({
  ...chain,
  rpcUrls: {
    ...chain.rpcUrls,
    default: {
      ...chain.rpcUrls.default,
      http: rpcUrls
    }
  }
});

export const KNOWN_VIEM_CHAINS = {
  1: withRpcUrls(ViemChains.mainnet, [
    `https://eth-rpc.kolibr.io?api_key=29eef2f0-e88c-443b-a140-333cf76631dd&rev_recv=0x3d7F458494A020dB3280e6f1C182B6b69862ce25`,
    'https://ethereum-rpc.publicnode.com',
    'https://cloudflare-eth.com',
    'https://eth.llamarpc.com',
    'https://eth.drpc.org',
    'https://eth.meowrpc.com',
    'https://endpoints.omniatech.io/v1/eth/mainnet/public'
  ]),
  5: ViemChains.goerli,
  10: withRpcUrls(ViemChains.optimism, [
    'https://optimism-rpc.publicnode.com',
    'https://mainnet.optimism.io',
    'https://optimism.drpc.org',
    'https://optimism.meowrpc.com',
    'https://1rpc.io/op'
  ]),
  30: ViemChains.rootstock,
  31: ViemChains.rootstockTestnet,
  56: withRpcUrls(ViemChains.bsc, [
    `https://bsc.kolibr.io?api_key=29eef2f0-e88c-443b-a140-333cf76631dd&rev_recv=0x3d7F458494A020dB3280e6f1C182B6b69862ce25`,
    'https://bsc-rpc.publicnode.com',
    'https://binance.llamarpc.com',
    'https://bsc.drpc.org',
    'https://bsc.meowrpc.com',
    'https://endpoints.omniatech.io/v1/bsc/mainnet/public',
    'https://1rpc.io/bnb'
  ]),
  97: withRpcUrls(ViemChains.bscTestnet, [
    'https://bsc-testnet-rpc.publicnode.com',
    'https://bsc-testnet.drpc.org',
    'https://endpoints.omniatech.io/v1/bsc/testnet/public'
  ]),
  100: ViemChains.gnosis,
  130: ViemChains.unichain,
  137: withRpcUrls(ViemChains.polygon, [
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygon-rpc.com',
    'https://polygon.drpc.org',
    'https://polygon.meowrpc.com',
    'https://endpoints.omniatech.io/v1/matic/mainnet/public',
    'https://1rpc.io/matic'
  ]),
  143: ViemChains.monad,
  204: ViemChains.opBNB,
  250: ViemChains.fantom,
  300: ViemChains.zksyncSepoliaTestnet,
  324: ViemChains.zksync,
  360: ViemChains.shape,
  420: ViemChains.optimismGoerli,
  480: ViemChains.worldchain,
  592: ViemChains.astar,
  747: ViemChains.flowMainnet,
  988: ViemChains.stable,
  999: ViemChains.hyperEvm,
  1088: ViemChains.metis,
  1101: ViemChains.polygonZkEvm,
  1329: ViemChains.sei,
  1442: ViemChains.polygonZkEvmTestnet,
  1514: ViemChains.story,
  1868: ViemChains.soneium,
  1946: ViemChains.soneiumMinato,
  2020: ViemChains.ronin,
  2442: ViemChains.polygonZkEvmCardona,
  2741: ViemChains.abstract,
  4002: ViemChains.fantomTestnet,
  4326: ViemChains.megaeth,
  4663: ViemChains.robinhood,
  4801: ViemChains.worldchainSepolia,
  5000: ViemChains.mantle,
  5003: ViemChains.mantleSepoliaTestnet,
  5031: ViemChains.somnia,
  5042: ViemChains.arc,
  5611: ViemChains.opBNBTestnet,
  7000: ViemChains.zetachain,
  7001: ViemChains.zetachainAthensTestnet,
  8333: ViemChains.b3,
  8453: withRpcUrls(ViemChains.base, [
    `https://base.kolibr.io?api_key=29eef2f0-e88c-443b-a140-333cf76631dd&rev_recv=0x3d7F458494A020dB3280e6f1C182B6b69862ce25`,
    'https://base-rpc.publicnode.com',
    'https://base.llamarpc.com',
    'https://base.drpc.org',
    'https://base.meowrpc.com',
    'https://base-pokt.nodies.app'
  ]),
  10200: ViemChains.gnosisChiado,
  10218: ViemChains.teaSepolia,
  11011: ViemChains.shapeSepolia,
  33139: ViemChains.apeChain,
  42161: withRpcUrls(ViemChains.arbitrum, [
    'https://arbitrum-one-rpc.publicnode.com',
    'https://arbitrum.drpc.org',
    'https://arb-pokt.nodies.app',
    'https://arbitrum.meowrpc.com',
    'https://1rpc.io/arb'
  ]),
  42220: ViemChains.celo,
  43113: withRpcUrls(ViemChains.avalancheFuji, [
    'https://avalanche-fuji-c-chain-rpc.publicnode.com',
    'https://avalanche-fuji.drpc.org',
    'https://endpoints.omniatech.io/v1/avax/fuji/public'
  ]),
  43114: withRpcUrls(ViemChains.avalanche, [
    'https://avalanche-c-chain-rpc.publicnode.com',
    'https://avalanche.drpc.org',
    'https://avax.meowrpc.com',
    'https://endpoints.omniatech.io/v1/avax/mainnet/public',
    'https://1rpc.io/avax/c'
  ]),
  43419: ViemChains.gunz,
  42170: ViemChains.arbitrumNova,
  44787: ViemChains.celoAlfajores,
  46630: ViemChains.robinhoodTestnet,
  57073: ViemChains.ink,
  59141: ViemChains.lineaSepolia,
  59144: ViemChains.linea,
  69000: animeChain,
  80001: ViemChains.polygonMumbai,
  80002: withRpcUrls(ViemChains.polygonAmoy, [
    'https://polygon-amoy-bor-rpc.publicnode.com',
    'https://rpc-amoy.polygon.technology',
    'https://polygon-amoy.drpc.org'
  ]),
  80084: ViemChains.berachainTestnetbArtio,
  80094: ViemChains.berachain,
  81457: ViemChains.blast,
  84531: ViemChains.baseGoerli,
  84532: withRpcUrls(ViemChains.baseSepolia, [
    'https://base-sepolia-rpc.publicnode.com',
    'https://base-sepolia.drpc.org',
    'https://sepolia.base.org'
  ]),
  421613: ViemChains.arbitrumGoerli,
  421614: withRpcUrls(ViemChains.arbitrumSepolia, [
    'https://arbitrum-sepolia-rpc.publicnode.com',
    'https://arbitrum-sepolia.drpc.org',
    'https://endpoints.omniatech.io/v1/arbitrum/sepolia/public'
  ]),
  534351: ViemChains.scrollSepolia,
  534352: ViemChains.scroll,
  685685: gensynTestnet,
  11155111: withRpcUrls(ViemChains.sepolia, [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.drpc.org',
    'https://1rpc.io/sepolia'
  ]),
  7777777: ViemChains.zora,
  11155420: withRpcUrls(ViemChains.optimismSepolia, [
    'https://optimism-sepolia-rpc.publicnode.com',
    'https://endpoints.omniatech.io/v1/op/sepolia/public',
    'https://sepolia.optimism.io'
  ]),
  11155931: ViemChains.riseTestnet,
  168587773: ViemChains.blastSepolia
} as const;
