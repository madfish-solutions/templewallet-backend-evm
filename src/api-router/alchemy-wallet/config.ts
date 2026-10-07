/** EVM mainnets from https://www.alchemy.com/docs/wallets/supported-chains */
export const SUPPORTED_CHAINS = [
  1, // Ethereum Mainnet
  10, // Optimism Mainnet
  25, // Cronos Mainnet
  56, // BNB Mainnet
  130, // Unichain Mainnet

  // Polygon Wallet API transactions require Gas Manager sponsorship.
  // https://www.alchemy.com/docs/wallets/resources/chain-reference/polygon-pos#transactions
  // 137, // Polygon Mainnet

  // Monad EIP-7702 requires Alchemy allowlisting and a 10 MON reserve.
  // https://www.alchemy.com/docs/wallets/transactions/using-eip-7702#eip-7702-support-on-monad
  // 143, // Monad Mainnet

  204, // opBNB Mainnet
  252, // Frax Mainnet
  360, // Shape Mainnet
  480, // Worldchain Mainnet
  988, // Stable Mainnet
  999, // Hyperliquid Mainnet
  1868, // Soneium Mainnet
  3343, // Edge Mainnet
  4326, // MegaETH Mainnet
  4663, // Robinhood Mainnet
  8008, // Polynomial Mainnet
  8453, // Base Mainnet
  9745, // Plasma Mainnet
  33139, // ApeChain Mainnet
  42161, // Arbitrum One Mainnet
  42170, // Arbitrum Nova Mainnet
  42220, // Celo Mainnet
  57073, // Ink Mainnet
  80094, // Berachain Mainnet
  685689 // Gensyn Mainnet
];
