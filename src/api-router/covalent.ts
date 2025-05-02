import { GoldRushClient, ChainID, GoldRushResponse } from '@covalenthq/client-sdk';

import { COVALENT_CONCURRENCY, COVALENT_RPS, EnvVars } from '../config';
import { CodedError } from '../utils/errors';
import { createQueuedFetchJobs } from '../utils/queued-fetch-jobs';

const client = new GoldRushClient(EnvVars.COVALENT_API_KEY, { enableRetry: false, threadCount: COVALENT_CONCURRENCY });

type CovalentQueueJobName = 'balances' | 'tokensMetadata' | 'collectiblesMetadata';
interface CovalentQueueJobData {
  walletAddress: string;
  chainId: number;
}
type CovalentQueueJobsInputs = Record<CovalentQueueJobName, CovalentQueueJobData>;

function getCovalentJobId(name: CovalentQueueJobName, { walletAddress, chainId }: CovalentQueueJobData) {
  return `${name}:${walletAddress.toLowerCase()}:${chainId}`;
}

const CHAIN_IDS_WITHOUT_CACHE_SUPPORT = [10, 11155420, 43114, 43113];
async function getCovalentResponse(name: CovalentQueueJobName, { walletAddress, chainId }: CovalentQueueJobData) {
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
    case 'tokensMetadata':
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

const { fetch, queue } = createQueuedFetchJobs<CovalentQueueJobName, CovalentQueueJobsInputs, string>({
  queueName: 'covalent-requests',
  costs: { balances: 1, tokensMetadata: 1, collectiblesMetadata: 1 },
  limitDuration: 1000,
  limitAmount: COVALENT_RPS,
  concurrency: COVALENT_CONCURRENCY,
  getId: getCovalentJobId,
  getOutput: getCovalentResponse
});

export const covalentRequestsQueue = queue;

export const getEvmBalances = (walletAddress: string, chainId: number) => fetch('balances', { walletAddress, chainId });

export const getEvmTokensMetadata = (walletAddress: string, chainId: number) =>
  fetch('tokensMetadata', { walletAddress, chainId });

export const getEvmCollectiblesMetadata = async (walletAddress: string, chainId: number) =>
  fetch('collectiblesMetadata', { walletAddress, chainId });
