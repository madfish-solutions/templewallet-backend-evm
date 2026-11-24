import { defineChain } from 'viem';

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
