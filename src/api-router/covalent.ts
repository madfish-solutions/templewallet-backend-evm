import { GoldRushClient, ChainID, GoldRushResponse } from '@covalenthq/client-sdk';

import { EnvVars } from '../config';
import { CodedError } from '../utils/errors';
import { createQueuedFetchJobs } from '../utils/queued-fetch-jobs';

const client = new GoldRushClient(EnvVars.COVALENT_API_KEY, { enableRetry: false, threadCount: 10 });

type CovalentQueueJobName = 'balances' | 'tokens-metadata' | 'collectibles-metadata';
interface CovalentQueueJobData {
  walletAddress: string;
  chainId: number;
}

const CHAIN_IDS_WITHOUT_CACHE_SUPPORT = [10, 11155420, 43114, 43113];
const { fetch, queue } = createQueuedFetchJobs<CovalentQueueJobName, CovalentQueueJobData, string>(
  'covalent-requests',
  (name, { walletAddress, chainId }) => `${name}:${walletAddress.toLowerCase()}:${chainId}`,
  async (name, { walletAddress, chainId }) => {
    let response: GoldRushResponse<unknown>;
    switch (name) {
      case 'balances':
        response = await client.BalanceService.getTokenBalancesForWalletAddress(chainId as ChainID, walletAddress, {
          nft: true,
          noNftAssetMetadata: true,
          quoteCurrency: 'USD',
          noSpam: false
        });
        break;
      case 'tokens-metadata':
        response = await client.BalanceService.getTokenBalancesForWalletAddress(chainId as ChainID, walletAddress, {
          nft: false,
          quoteCurrency: 'USD',
          noSpam: false
        });
        break;
      default:
        const withUncached = CHAIN_IDS_WITHOUT_CACHE_SUPPORT.includes(chainId);
        response = await client.NftService.getNftsForAddress(chainId as ChainID, walletAddress, {
          withUncached,
          noSpam: false
        });
    }

    if (response.error) {
      const code =
        response.error_code && Number.isSafeInteger(Number(response.error_code)) ? Number(response.error_code) : 500;

      throw new CodedError(code, response.error_message ?? 'Unknown error');
    }

    return JSON.stringify(response.data, (_, value) => (typeof value === 'bigint' ? value.toString() : value));
  }
);
export const covalentRequestsQueue = queue;

export const getEvmBalances = (walletAddress: string, chainId: number) => fetch('balances', { walletAddress, chainId });

export const getEvmTokensMetadata = (walletAddress: string, chainId: number) =>
  fetch('tokens-metadata', { walletAddress, chainId });

export const getEvmCollectiblesMetadata = async (walletAddress: string, chainId: number) =>
  fetch('collectibles-metadata', { walletAddress, chainId });
