import { Network } from 'alchemy-sdk';
import {
  mainnet,
  goerli,
  optimism,
  rootstock,
  rootstockTestnet,
  bsc,
  bscTestnet,
  gnosis,
  polygon,
  opBNB,
  fantom,
  zksync,
  zksyncSepoliaTestnet,
  shape,
  optimismGoerli,
  worldchain,
  astar,
  metis,
  polygonZkEvm,
  polygonZkEvmTestnet,
  soneiumMinato,
  polygonZkEvmCardona,
  fantomTestnet,
  worldchainSepolia,
  mantle,
  mantleSepoliaTestnet,
  opBNBTestnet,
  zetachain,
  zetachainAthensTestnet,
  base,
  gnosisChiado,
  shapeSepolia,
  arbitrum,
  celo,
  avalancheFuji,
  avalanche,
  arbitrumNova,
  celoAlfajores,
  lineaSepolia,
  linea,
  polygonMumbai,
  polygonAmoy,
  berachainTestnetbArtio,
  blast,
  baseGoerli,
  baseSepolia,
  arbitrumGoerli,
  arbitrumSepolia,
  scrollSepolia,
  scroll,
  sepolia,
  optimismSepolia,
  blastSepolia
} from 'viem/chains';

/** TODO: Verify this mapping */
export const ALCHEMY_CHAINS_NAMES: Record<number, Network> = {
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

// Patch these viem chains with the URLs above
export const ALCHEMY_VIEM_CHAINS = {
  1: {
    ...mainnet,
    rpcUrls: {
      ...mainnet.rpcUrls,
      default: {
        ...mainnet.rpcUrls.default,
        http: [
          `https://eth-rpc.kolibr.io?api_key=29eef2f0-e88c-443b-a140-333cf76631dd&rev_recv=0x3d7F458494A020dB3280e6f1C182B6b69862ce25`,
          'https://ethereum-rpc.publicnode.com',
          'https://cloudflare-eth.com',
          'https://eth.llamarpc.com',
          'https://eth.drpc.org',
          'https://eth.meowrpc.com',
          'https://endpoints.omniatech.io/v1/eth/mainnet/public'
        ]
      }
    }
  },
  5: goerli,
  10: {
    ...optimism,
    rpcUrls: {
      ...optimism.rpcUrls,
      default: {
        ...optimism.rpcUrls.default,
        http: [
          'https://optimism-rpc.publicnode.com',
          'https://mainnet.optimism.io',
          'https://optimism.drpc.org',
          'https://optimism.meowrpc.com',
          'https://1rpc.io/op'
        ]
      }
    }
  },
  30: rootstock,
  31: rootstockTestnet,
  56: {
    ...bsc,
    rpcUrls: {
      ...bsc.rpcUrls,
      default: {
        ...bsc.rpcUrls.default,
        http: [
          `https://bsc.kolibr.io?api_key=29eef2f0-e88c-443b-a140-333cf76631dd&rev_recv=0x3d7F458494A020dB3280e6f1C182B6b69862ce25`,
          'https://bsc-rpc.publicnode.com',
          'https://binance.llamarpc.com',
          'https://bsc.drpc.org',
          'https://bsc.meowrpc.com',
          'https://endpoints.omniatech.io/v1/bsc/mainnet/public',
          'https://1rpc.io/bnb'
        ]
      }
    }
  },
  97: {
    ...bscTestnet,
    rpcUrls: {
      ...bscTestnet.rpcUrls,
      default: {
        ...bscTestnet.rpcUrls.default,
        http: [
          'https://bsc-testnet-rpc.publicnode.com',
          'https://bsc-testnet.drpc.org',
          'https://endpoints.omniatech.io/v1/bsc/testnet/public'
        ]
      }
    }
  },
  100: gnosis,
  137: {
    ...polygon,
    rpcUrls: {
      ...polygon.rpcUrls,
      default: {
        ...polygon.rpcUrls.default,
        http: [
          'https://polygon-bor-rpc.publicnode.com',
          'https://polygon-rpc.com',
          'https://polygon.drpc.org',
          'https://polygon.meowrpc.com',
          'https://endpoints.omniatech.io/v1/matic/mainnet/public',
          'https://1rpc.io/matic'
        ]
      }
    }
  },
  204: opBNB,
  250: fantom,
  300: zksyncSepoliaTestnet,
  324: zksync,
  360: shape,
  420: optimismGoerli,
  480: worldchain,
  592: astar,
  1088: metis,
  1101: polygonZkEvm,
  1442: polygonZkEvmTestnet,
  1946: soneiumMinato,
  2442: polygonZkEvmCardona,
  4002: fantomTestnet,
  4801: worldchainSepolia,
  5000: mantle,
  5003: mantleSepoliaTestnet,
  5611: opBNBTestnet,
  7000: zetachain,
  7001: zetachainAthensTestnet,
  8453: {
    ...base,
    rpcUrls: {
      ...base.rpcUrls,
      default: {
        ...base.rpcUrls.default,
        http: [
          `https://base.kolibr.io?api_key=29eef2f0-e88c-443b-a140-333cf76631dd&rev_recv=0x3d7F458494A020dB3280e6f1C182B6b69862ce25`,
          'https://base-rpc.publicnode.com',
          'https://base.llamarpc.com',
          'https://base.drpc.org',
          'https://base.meowrpc.com',
          'https://base-pokt.nodies.app'
        ]
      }
    }
  },
  10200: gnosisChiado,
  11011: shapeSepolia,
  42161: {
    ...arbitrum,
    rpcUrls: {
      ...arbitrum.rpcUrls,
      default: {
        ...arbitrum.rpcUrls.default,
        http: [
          'https://arbitrum-one-rpc.publicnode.com',
          'https://arbitrum.drpc.org',
          'https://arb-pokt.nodies.app',
          'https://arbitrum.meowrpc.com',
          'https://1rpc.io/arb'
        ]
      }
    }
  },
  42220: celo,
  43113: {
    ...avalancheFuji,
    rpcUrls: {
      ...avalancheFuji.rpcUrls,
      default: {
        ...avalancheFuji.rpcUrls.default,
        http: [
          'https://avalanche-fuji-c-chain-rpc.publicnode.com',
          'https://avalanche-fuji.drpc.org',
          'https://endpoints.omniatech.io/v1/avax/fuji/public'
        ]
      }
    }
  },
  43114: {
    ...avalanche,
    rpcUrls: {
      ...avalanche.rpcUrls,
      default: {
        ...avalanche.rpcUrls.default,
        http: [
          'https://avalanche-c-chain-rpc.publicnode.com',
          'https://avalanche.drpc.org',
          'https://avax.meowrpc.com',
          'https://endpoints.omniatech.io/v1/avax/mainnet/public',
          'https://1rpc.io/avax/c'
        ]
      }
    }
  },
  42170: arbitrumNova,
  44787: celoAlfajores,
  59141: lineaSepolia,
  59144: linea,
  80001: polygonMumbai,
  80002: {
    ...polygonAmoy,
    rpcUrls: {
      ...polygonAmoy.rpcUrls,
      default: {
        ...polygonAmoy.rpcUrls.default,
        http: [
          'https://polygon-amoy-bor-rpc.publicnode.com',
          'https://rpc-amoy.polygon.technology',
          'https://polygon-amoy.drpc.org'
        ]
      }
    }
  },
  80084: berachainTestnetbArtio,
  81457: blast,
  84531: baseGoerli,
  84532: {
    ...baseSepolia,
    rpcUrls: {
      ...baseSepolia.rpcUrls,
      default: {
        ...baseSepolia.rpcUrls.default,
        http: ['https://base-sepolia-rpc.publicnode.com', 'https://base-sepolia.drpc.org', 'https://sepolia.base.org']
      }
    }
  },
  421613: arbitrumGoerli,
  421614: {
    ...arbitrumSepolia,
    rpcUrls: {
      ...arbitrumSepolia.rpcUrls,
      default: {
        ...arbitrumSepolia.rpcUrls.default,
        http: [
          'https://arbitrum-sepolia-rpc.publicnode.com',
          'https://arbitrum-sepolia.drpc.org',
          'https://endpoints.omniatech.io/v1/arbitrum/sepolia/public'
        ]
      }
    }
  },
  534351: scrollSepolia,
  534352: scroll,
  11155111: {
    ...sepolia,
    rpcUrls: {
      ...sepolia.rpcUrls,
      default: {
        ...sepolia.rpcUrls.default,
        http: ['https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.drpc.org', 'https://1rpc.io/sepolia']
      }
    }
  },
  11155420: {
    ...optimismSepolia,
    rpcUrls: {
      ...optimismSepolia.rpcUrls,
      default: {
        ...optimismSepolia.rpcUrls.default,
        http: [
          'https://optimism-sepolia-rpc.publicnode.com',
          'https://endpoints.omniatech.io/v1/op/sepolia/public',
          'https://sepolia.optimism.io'
        ]
      }
    }
  },
  168587773: blastSepolia
} as const;
