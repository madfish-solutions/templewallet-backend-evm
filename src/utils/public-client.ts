import memoizee from 'memoizee';
import { Chain, createPublicClient, fallback, http, PublicClient } from 'viem';

import { EnvVars } from '../config.js';

import { KNOWN_VIEM_CHAINS } from './chains.js';

export class ChainNotSupportedError extends Error {
  constructor(chainId: number) {
    super(`Chain ${chainId} not supported`);
  }
}

export const makeAlchemyRpcUrl = (alchemyChainName: string) =>
  `https://${alchemyChainName}.g.alchemy.com/v2/${EnvVars.ALCHEMY_API_KEY}`;

export const makeFallbackPublicClient = memoizee(
  (chainId: number, alchemyChainName?: string): PublicClient => {
    // Indexing the const chain map with `number` is `any`. Annotating as `Chain`
    // keeps the client on viem's PublicClient instead of a separate instantiation.
    const chain: Chain | undefined = KNOWN_VIEM_CHAINS[chainId];

    if (!chain) {
      throw new ChainNotSupportedError(chainId);
    }

    return createPublicClient({
      chain,
      // Default retries are necessary because some nodes may not return old blocks
      transport: fallback(
        chain.rpcUrls.default.http
          .concat(alchemyChainName ? makeAlchemyRpcUrl(alchemyChainName) : [])
          .map(rpcUrl => http(rpcUrl, { retryCount: 0 }))
      )
    });
  },
  { max: 100 }
);
