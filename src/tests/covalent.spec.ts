import { rejects } from 'assert';
import retry from 'async-retry';

import {
  COST_DECIMALS_MULTIPLIER,
  CovalentQueueJobName,
  covalentRequestsCosts,
  covalentRequestsQueue,
  covalentRequestsQueueEvents
} from '../api-router/covalent';
import { COVALENT_CONCURRENCY, COVALENT_RPS } from '../config';

import {
  api,
  assertConcurrency,
  assertPointsConsumption,
  deepEqualWithoutUndefined,
  isBadRequestError,
  makeAssertJobsFunction,
  TEST_ACCOUNT_ADDRESS,
  TEST_ACCOUNT_ADDRESS_UPPER,
  VITALIK_ADDRESS,
  withQueueEventsListening
} from './utils';

interface CovalentApiRequestParams {
  walletAddress: string;
  chainId: number | string;
}

const makeCovalentRequestFunction = (endpoint: string) => (params: CovalentApiRequestParams) =>
  api.get(endpoint, { params });

const assertJobs = makeAssertJobsFunction(
  covalentRequestsQueue,
  ({ name: aName, data: aData }, { name: bName, data: bData }) => {
    const { walletAddress: aWalletAddress, chainId: aChainId } = aData;
    const { walletAddress: bWalletAddress, chainId: bChainId } = bData;

    if (aWalletAddress !== bWalletAddress) {
      return aWalletAddress.localeCompare(bWalletAddress);
    }

    if (aChainId !== bChainId) {
      return aChainId - bChainId;
    }

    return aName.localeCompare(bName);
  }
);

const makeExpectedCompletedJobs = (data: CovalentApiRequestParams, jobName: CovalentQueueJobName) => [
  {
    name: jobName,
    data: {
      walletAddress: data.walletAddress,
      chainId: Number(data.chainId)
    },
    state: 'completed' as const
  }
];

const entrypointsToTest = [
  { path: '/balances', jobName: 'balances' as const },
  { path: '/tokens-metadata', jobName: 'tokensMetadata' as const },
  { path: '/collectibles-metadata', jobName: 'collectiblesMetadata' as const }
];

describe('covalent', function () {
  this.timeout(20000);
  beforeEach(async () => covalentRequestsQueue.obliterate());
  this.afterAll(async () => covalentRequestsQueue.obliterate());

  const makeSingleEntrypointTests = (entrypoint: string, jobName: CovalentQueueJobName) => {
    const makeRequest = makeCovalentRequestFunction(entrypoint);

    describe(entrypoint, () => {
      it('should do no requests if an input is invalid', async () => {
        await rejects(makeRequest({ walletAddress: '0xdeadbeef', chainId: 1 }), isBadRequestError);
        await rejects(makeRequest({ walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 0 }), isBadRequestError);
        await assertJobs([]);
      });

      it('should do exactly one request to API for simultaneous duplicate requests', async () => {
        const requestsParams = [
          { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 1 },
          { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: '0x1' },
          { walletAddress: TEST_ACCOUNT_ADDRESS.toLowerCase(), chainId: '1' },
          { walletAddress: TEST_ACCOUNT_ADDRESS_UPPER, chainId: '1' }
        ];
        const results = await Promise.all(requestsParams.map(makeRequest));
        for (let i = 0; i < results.length - 1; i++) {
          deepEqualWithoutUndefined(results[i].data, results[i + 1].data);
        }
        await assertJobs(makeExpectedCompletedJobs(requestsParams[0], jobName));
      });

      it('should do a request to API for each request if they go one-by-one', async () => {
        const requestParams = { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 1 };
        for (let i = 0; i < 2; i++) {
          await makeRequest(requestParams);
        }
        await assertJobs([0, 1].flatMap(() => makeExpectedCompletedJobs(requestParams, jobName)));
      });

      it('should do a request to API for each unique request', async () => {
        const requestsParams = [
          { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 1 },
          { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 56 },
          { walletAddress: VITALIK_ADDRESS, chainId: 56 }
        ];
        await Promise.all(requestsParams.map(makeRequest));
        await assertJobs(requestsParams.map(params => makeExpectedCompletedJobs(params, jobName)).flat());
      });
    });
  };
  entrypointsToTest.forEach(({ path, jobName }) => {
    makeSingleEntrypointTests(path, jobName);
  });

  it('should respect the limits for CUs per second and concurrency', async function () {
    this.timeout(5 * 60 * 1000);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const EXT_DEFAULT_CHAINS_IDS = [1, 10, 56, 137, 8453, 42161, 43114, 11155111, 11155420, 97, 80002, 43113];
    const { ptsConsumption, jobCounterChanges } = await withQueueEventsListening(
      covalentRequestsQueueEvents,
      () =>
        Promise.allSettled(
          entrypointsToTest.flatMap(({ path }) => {
            const makeRequest = makeCovalentRequestFunction(path);

            return [TEST_ACCOUNT_ADDRESS, VITALIK_ADDRESS].flatMap(walletAddress =>
              EXT_DEFAULT_CHAINS_IDS.map(chainId =>
                retry(() => makeRequest({ walletAddress, chainId }), { retries: 3 })
              )
            );
          })
        ),
      covalentRequestsQueue,
      covalentRequestsCosts
    );
    assertPointsConsumption(ptsConsumption, COVALENT_RPS * COST_DECIMALS_MULTIPLIER);
    assertConcurrency(jobCounterChanges, COVALENT_CONCURRENCY);
  });
});
