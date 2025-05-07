import { GoldRushClient, ChainID, GoldRushResponse } from '@covalenthq/client-sdk';

import { COVALENT_CONCURRENCY, COVALENT_RPS, EnvVars } from '../config';
import { CodedError } from '../utils/errors';
import { createQueuedFetchJobs } from '../utils/queued-fetch-jobs';

const client = new GoldRushClient(EnvVars.COVALENT_API_KEY, { enableRetry: false, threadCount: COVALENT_CONCURRENCY });

export type CovalentQueueJobName = 'balances' | 'tokensMetadata' | 'collectiblesMetadata';
interface CovalentQueueJobData {
  walletAddress: string;
  chainId: number;
}
type CovalentQueueJobsInputs = Record<CovalentQueueJobName, CovalentQueueJobData>;

function getCovalentJobId(name: CovalentQueueJobName, { walletAddress, chainId }: CovalentQueueJobData) {
  return `${name}:${walletAddress.toLowerCase()}:${chainId}`;
}

let supportedChains: number[] | undefined;
const NOT_SUPPORTED_CHAIN_ERROR_REGEX =
  /^\d+\/[a-z0-9-]+ chain not supported, currently supports:(\s*\d+\/[a-z0-9-]+)+/i;
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
      const withUncached = Boolean(supportedChains && !supportedChains.includes(chainId));
      response = await client.NftService.getNftsForAddress(chainId as ChainID, walletAddress, {
        withUncached,
        noSpam: false
      });
      if (response.error) {
        const notSupportedChainErrorMatch = response.error_message?.match(NOT_SUPPORTED_CHAIN_ERROR_REGEX);
        if (notSupportedChainErrorMatch) {
          supportedChains = notSupportedChainErrorMatch[0]
            .split(':')[1]
            .trim()
            .split(/\s+/)
            .map(s => parseInt(s));
          response = await client.NftService.getNftsForAddress(chainId as ChainID, walletAddress, {
            withUncached: true,
            noSpam: false
          });
        }
      }
  }

  if (response.error) {
    const { error_code, error_message } = response;
    const code = error_code && Number.isSafeInteger(Number(error_code)) ? Number(error_code) : 500;

    throw new CodedError(code, error_message ?? 'Unknown error');
  }

  return JSON.stringify(response.data, (_, value) => (typeof value === 'bigint' ? value.toString() : value));
}

export const COST_DECIMALS_MULTIPLIER = 10;
/*
 * 1. The values are multiplied by `COST_DECIMALS_MULTIPLIER` to avoid errors in the rate limiter caused by floating
 *    point values.
 * 2. The cost for `collectiblesMetadata` is bigger because two requests may be required if the list of supported chains
 *    is changed.
 */
export const covalentRequestsCosts = {
  balances: COST_DECIMALS_MULTIPLIER,
  tokensMetadata: COST_DECIMALS_MULTIPLIER,
  collectiblesMetadata: Math.round(1.1 * COST_DECIMALS_MULTIPLIER)
};
const { fetch, queue, queueEvents } = createQueuedFetchJobs<CovalentQueueJobName, CovalentQueueJobsInputs, string>({
  queueName: 'covalent-requests',
  costs: covalentRequestsCosts,
  limitDuration: 1000,
  limitAmount: COVALENT_RPS * COST_DECIMALS_MULTIPLIER,
  concurrency: COVALENT_CONCURRENCY,
  getId: getCovalentJobId,
  getOutput: getCovalentResponse
});

export const covalentRequestsQueue = queue;
export const covalentRequestsQueueEvents = queueEvents;

export const getEvmBalances = (walletAddress: string, chainId: number) => fetch('balances', { walletAddress, chainId });

export const getEvmTokensMetadata = (walletAddress: string, chainId: number) =>
  fetch('tokensMetadata', { walletAddress, chainId });

export const getEvmCollectiblesMetadata = async (walletAddress: string, chainId: number) =>
  fetch('collectiblesMetadata', { walletAddress, chainId });
