import { defineChain } from 'viem';

export const monadChain = defineChain({
  id: 143,
  name: 'Monad',
  blockTime: 400,
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.monad.xyz', 'https://rpc1.monad.xyz'],
      webSocket: ['wss://rpc.monad.xyz', 'wss://rpc1.monad.xyz']
    }
  },
  blockExplorers: {
    default: {
      name: 'Monadscan',
      url: 'https://monadscan.com',
      apiUrl: 'https://api.etherscan.io/v2/api?chainid=143'
    },
    monadvision: {
      name: 'MonadVision',
      url: 'https://monadvision.com'
    }
  },
  testnet: false,
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 9248132
    }
  }
});
export const hyperEvmChain = defineChain({
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  blockExplorers: {
    default: {
      name: 'HyperEVMScan',
      url: 'https://hyperevmscan.io'
    }
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 13051
    }
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.hyperliquid.xyz/evm']
    }
  },
  testnet: false
});

const megaethSourceId = 1;
export const megaethChain = defineChain({
  id: 4326,
  blockTime: 1_000,
  name: 'MegaETH',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['https://mainnet.megaeth.com/rpc'],
      webSocket: ['wss://mainnet.megaeth.com/ws']
    }
  },
  blockExplorers: {
    default: {
      name: 'Etherscan',
      url: 'https://mega.etherscan.io',
      apiUrl: 'https://api.etherscan.io/v2/api'
    },
    blockscout: {
      name: 'Blockscout',
      url: 'https://megaeth.blockscout.com',
      apiUrl: 'https://megaeth.blockscout.com/api'
    }
  },
  contracts: {
    gasPriceOracle: { address: '0x420000000000000000000000000000000000000F' },
    l1Block: { address: '0x4200000000000000000000000000000000000015' },
    l2CrossDomainMessenger: {
      address: '0x4200000000000000000000000000000000000007'
    },
    l2Erc721Bridge: { address: '0x4200000000000000000000000000000000000014' },
    l2StandardBridge: { address: '0x4200000000000000000000000000000000000010' },
    l2ToL1MessagePasser: {
      address: '0x4200000000000000000000000000000000000016'
    },
    disputeGameFactory: {
      [megaethSourceId]: {
        address: '0x8546840adF796875cD9AAcc5B3B048f6B2c9D563'
      }
    },
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 0
    },
    portal: {
      [megaethSourceId]: {
        address: '0x7f82f57F0Dd546519324392e408b01fcC7D709e8',
        blockCreated: 21644285
      }
    },
    l1StandardBridge: {
      [megaethSourceId]: {
        address: '0x0CA3A2FBC3D770b578223FBB6b062fa875a2eE75',
        blockCreated: 21644285
      }
    }
  },
  sourceId: megaethSourceId
});

export const somniaChain = defineChain({
  id: 5031,
  name: 'Somnia',
  nativeCurrency: { name: 'Somnia', symbol: 'SOMI', decimals: 18 },
  blockTime: 100,
  rpcUrls: {
    default: {
      http: ['https://api.infra.mainnet.somnia.network']
    }
  },
  blockExplorers: {
    default: {
      name: 'Somnia Explorer',
      url: 'https://explorer.somnia.network',
      apiUrl: 'https://explorer.somnia.network/api'
    }
  },
  contracts: {
    multicall3: {
      address: '0x5e44F178E8cF9B2F5409B6f18ce936aB817C5a11',
      blockCreated: 38516341
    }
  },
  testnet: false
});

export const animeChain = defineChain({
  id: 69000,
  name: 'Anime',
  nativeCurrency: { name: 'Anime', symbol: 'ANIME', decimals: 18 },
  blockTime: 20_000,
  rpcUrls: {
    default: {
      http: ['https://rpc.anime.com']
    }
  },
  blockExplorers: {
    default: {
      name: 'Animechain Explorer',
      url: 'https://explorer.anime.xyz'
    }
  },
  testnet: false
});

export const stableChain = defineChain({
  id: 988,
  name: 'Stable Mainnet',
  blockTime: 700,
  nativeCurrency: {
    name: 'USDT0',
    symbol: 'USDT0',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.stable.xyz'],
      webSocket: ['wss://rpc.stable.xyz']
    }
  },
  blockExplorers: {
    default: {
      name: 'Stablescan',
      url: 'https://stablescan.xyz',
      apiUrl: 'https://api.etherscan.io/v2/api?chainid=988'
    }
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 2423647
    }
  },
  testnet: false
});

export const arcChain = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [
        'https://rpc.mainnet.arc.io',
        'https://rpc.blockdaemon.mainnet.arc.io',
        'https://rpc.drpc.mainnet.arc.io',
        'https://rpc.quicknode.mainnet.arc.io'
      ]
    }
  },
  blockExplorers: {
    default: {
      name: 'Arc Explorer',
      url: 'https://explorer.arc.io',
      apiUrl: 'https://explorer.arc.io/api/v2'
    }
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 0
    }
  }
});
