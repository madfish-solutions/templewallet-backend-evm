import { GoldRushClient, ChainID, GoldRushResponse, ChainActivityResponse } from '@covalenthq/client-sdk';
import memoizee from 'memoizee';

import { COVALENT_CONCURRENCY, COVALENT_RPS, EnvVars } from '../config';
import { CodedError } from '../utils/errors';
import { createQueuedFetchJobs } from '../utils/queued-fetch-jobs';

const client = new GoldRushClient(EnvVars.COVALENT_API_KEY, { enableRetry: false, threadCount: COVALENT_CONCURRENCY });

export type CovalentQueueJobName = 'accountActivity' | 'balances' | 'tokensMetadata' | 'collectiblesMetadata';
type CovalentOneChainJobName = Exclude<CovalentQueueJobName, 'accountActivity'>;

export interface CovalentQueueJobsInputs
  extends Record<CovalentOneChainJobName, { walletAddress: string; chainId: number }> {
  accountActivity: {
    walletAddress: string;
  };
}

function getCovalentJobDeduplicationId(
  name: CovalentQueueJobName,
  { walletAddress, chainId }: { walletAddress: string; chainId?: number }
) {
  return `${name}:${walletAddress.toLowerCase()}:${chainId}`;
}

let supportedChains: number[] | undefined;
const NOT_SUPPORTED_CHAIN_ERROR_REGEX =
  /^\d+\/[a-z0-9-]+ chain not supported, currently supports:(\s*\d+\/[a-z0-9-]+)+/i;

const MAX_AGE = 20_000;
const memoizeAsync = <T extends (...args: any[]) => Promise<any>>(fn: T) =>
  memoizee(fn, {
    promise: true,
    maxAge: MAX_AGE
  });

type JobArgs<T extends CovalentQueueJobName> = [name: T, data: CovalentQueueJobsInputs[T]];
async function getCovalentResponse(...args: JobArgs<CovalentOneChainJobName>): Promise<string>;
async function getCovalentResponse(
  name: 'accountActivity',
  data: CovalentQueueJobsInputs['accountActivity']
): Promise<string>;
async function getCovalentResponse(
  ...args: JobArgs<CovalentOneChainJobName> | JobArgs<'accountActivity'>
): Promise<string> {
  const [name, data] = args;
  let response: GoldRushResponse<unknown>;
  switch (name) {
    case 'accountActivity':
      response = await client.AllChainsService.getAddressActivity(data.walletAddress, { testnets: false });
      break;
    case 'balances':
      response = await client.BalanceService.getTokenBalancesForWalletAddress(
        data.chainId as ChainID,
        data.walletAddress,
        { nft: true, noNftAssetMetadata: true, quoteCurrency: 'USD', noSpam: false }
      );
      break;
    case 'tokensMetadata':
      response = await client.BalanceService.getTokenBalancesForWalletAddress(
        data.chainId as ChainID,
        data.walletAddress,
        { nft: false, quoteCurrency: 'USD', noSpam: false }
      );
      break;
    default:
      const { walletAddress, chainId } = data;
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
  accountActivity: COST_DECIMALS_MULTIPLIER,
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
  getDeduplicationId: getCovalentJobDeduplicationId,
  getOutput: getCovalentResponse
});

export const covalentRequestsQueue = queue;
export const covalentRequestsQueueEvents = queueEvents;

type AfterJsonCycle<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends Date
    ? string
    : T extends Array<infer U>
      ? AfterJsonCycle<U>[]
      : T extends object
        ? { [K in keyof T]: AfterJsonCycle<T[K]> }
        : never;

export const getEvmAccountActivity = memoizeAsync(
  (walletAddress: string): Promise<AfterJsonCycle<ChainActivityResponse>> =>
    fetch('accountActivity', { walletAddress }).then(JSON.parse)
);

export const getEvmBalances = memoizeAsync((walletAddress: string, chainId: number) =>
  fetch('balances', { walletAddress, chainId })
);

export const getEvmTokensMetadata = memoizeAsync((walletAddress: string, chainId: number) =>
  fetch('tokensMetadata', { walletAddress, chainId })
);

export const getEvmCollectiblesMetadata = memoizeAsync((walletAddress: string, chainId: number) =>
  fetch('collectiblesMetadata', { walletAddress, chainId })
);
