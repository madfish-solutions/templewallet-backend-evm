import { GoldRushClient, ChainID, GoldRushResponse } from '@covalenthq/client-sdk';
import retry from 'async-retry';
import memoizee from 'memoizee';

import { EnvVars } from '../config';
import { CodedError } from '../utils/errors';

const client = new GoldRushClient(EnvVars.COVALENT_API_KEY, { enableRetry: false, threadCount: 10 });

const RETRY_OPTIONS: retry.Options = { maxRetryTime: 30_000 };
const CHAIN_IDS_WITHOUT_CACHE_SUPPORT = [10, 11155420, 43114, 43113];
const MAX_AGE = 20_000;

const memoizeAsync = <T extends (...args: any[]) => Promise<any>>(fn: T) =>
  memoizee(fn, {
    promise: true,
    maxAge: MAX_AGE
  });

export const getEvmAccountActivity = memoizeAsync((walletAddress: string) =>
  retry(
    () =>
      client.AllChainsService.getAddressActivity(walletAddress, { testnets: false }).then(res =>
        processGoldRushResponse(res, false)
      ),
    RETRY_OPTIONS
  )
);

export const getEvmBalances = memoizeAsync(async (walletAddress: string, chainId: number) => {
  return retry(
    () =>
      client.BalanceService.getTokenBalancesForWalletAddress(chainId as ChainID, walletAddress, {
        nft: true,
        noNftAssetMetadata: true,
        quoteCurrency: 'USD',
        noSpam: false
      }).then(res => processGoldRushResponse(res)),
    RETRY_OPTIONS
  );
});

export const getEvmTokensMetadata = memoizeAsync(async (walletAddress: string, chainId: number) => {
  return retry(
    () =>
      client.BalanceService.getTokenBalancesForWalletAddress(chainId as ChainID, walletAddress, {
        nft: false,
        quoteCurrency: 'USD',
        noSpam: false
      }).then(res => processGoldRushResponse(res)),
    RETRY_OPTIONS
  );
});

export const getEvmCollectiblesMetadata = memoizeAsync(async (walletAddress: string, chainId: number) => {
  const withUncached = CHAIN_IDS_WITHOUT_CACHE_SUPPORT.includes(chainId);

  return retry(
    () =>
      client.NftService.getNftsForAddress(chainId as ChainID, walletAddress, {
        withUncached,
        noSpam: false
      }).then(res => processGoldRushResponse(res)),
    RETRY_OPTIONS
  );
});

function processGoldRushResponse<T>({ data, error, error_message, error_code }: GoldRushResponse<T>): string;
function processGoldRushResponse<T>(
  { data, error, error_message, error_code }: GoldRushResponse<T>,
  serialize: false
): T;
function processGoldRushResponse<T>(
  { data, error, error_message, error_code }: GoldRushResponse<T>,
  serialize = true
): string | T {
  if (error) {
    const code = error_code && Number.isSafeInteger(Number(error_code)) ? Number(error_code) : 500;

    throw new CodedError(code, error_message ?? 'Unknown error');
  }

  return serialize ? JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? value.toString() : value)) : data;
}
