import assert, { deepStrictEqual, rejects } from 'assert';
import axios, { AxiosError, AxiosResponse } from 'axios';
import type { JobState } from 'bullmq';

import {
  AlchemyQueueJobsInputs,
  alchemyRequestsCosts,
  alchemyRequestsQueue,
  alchemyRequestsQueueEvents
} from '../api-router/alchemy';
import { ALCHEMY_CUPS, PORT } from '../config';

const api = axios.create({ baseURL: `http://localhost:${PORT}/api` });

interface TransactionsHistoryRequestParams {
  walletAddress: string;
  chainId: number | string;
  contractAddress?: string;
  olderThanBlockHeight?: string | number;
}

interface JobSnapshotBase<N extends keyof AlchemyQueueJobsInputs> {
  name: N;
  data: AlchemyQueueJobsInputs[N];
  state: JobState | unknown;
}
type JobSnapshot = JobSnapshotBase<'approvals'> | JobSnapshotBase<'assetTransfers'>;

function objectWithoutUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return [key, objectWithoutUndefined(value)];
        }

        return [key, value];
      })
  ) as T;
}
function deepEqualWithoutUndefined<T extends object>(a: T, b: T) {
  deepStrictEqual(objectWithoutUndefined(a), objectWithoutUndefined(b));
}

function makeHistoryRequest(params: TransactionsHistoryRequestParams) {
  return api.get('/transactions/v2', { params });
}

async function getJobsSnapshot() {
  const allJobs = await alchemyRequestsQueue.getJobs();

  return Promise.all(
    allJobs.map(async job => {
      const { name, data } = job;

      return { name, data, state: await job.getState() } as JobSnapshot;
    })
  );
}

const HUGE_BLOCK_HEIGHT = `0x${(2 ** 256).toString(16)}`;

function jobSortPredicate(a: JobSnapshot, b: JobSnapshot) {
  const {
    accAddress: aAccAddress,
    chainId: aChainId,
    contractAddress: aContractAddress = '',
    toBlock: aToBlock = HUGE_BLOCK_HEIGHT
  } = a.data;
  const {
    accAddress: bAccAddress,
    chainId: bChainId,
    contractAddress: bContractAddress = '',
    toBlock: bToBlock = HUGE_BLOCK_HEIGHT
  } = b.data;

  if (aAccAddress !== bAccAddress) {
    return aAccAddress.localeCompare(bAccAddress);
  }

  if (aChainId !== bChainId) {
    return aChainId - bChainId;
  }

  if (aContractAddress !== bContractAddress) {
    return aContractAddress.localeCompare(bContractAddress);
  }

  if (aToBlock !== bToBlock) {
    return Number(bToBlock) - Number(aToBlock);
  }

  if (a.name !== b.name) {
    return a.name.localeCompare(b.name);
  }

  if (a.name === 'assetTransfers') {
    const { toAcc: aToAcc } = a.data;
    const { toAcc: bToAcc } = (b as JobSnapshotBase<'assetTransfers'>).data;

    return Number(aToAcc) - Number(bToAcc);
  }

  return 0;
}

async function assertJobs(expectedJobs: JobSnapshot[]) {
  deepEqualWithoutUndefined(
    (await getJobsSnapshot()).toSorted(jobSortPredicate),
    expectedJobs.toSorted(jobSortPredicate)
  );
}

function makeExpectedCompletedJobs(
  { walletAddress: accAddress, chainId, contractAddress, olderThanBlockHeight }: TransactionsHistoryRequestParams,
  transfers: any[]
): JobSnapshot[] {
  const toBlock =
    olderThanBlockHeight === undefined ? undefined : `0x${(Number(olderThanBlockHeight) - 1).toString(16)}`;
  const assetTransfersDataBase: Omit<AlchemyQueueJobsInputs['assetTransfers'], 'toAcc'> = {
    chainId: Number(chainId),
    accAddress,
    contractAddress,
    toBlock
  };

  return [
    {
      name: 'assetTransfers',
      data: { ...assetTransfersDataBase, toAcc: false },
      state: 'completed'
    },
    {
      name: 'assetTransfers',
      data: { ...assetTransfersDataBase, toAcc: true },
      state: 'completed'
    },
    {
      name: 'approvals',
      data: {
        chainId: Number(chainId),
        accAddress,
        contractAddress,
        toBlock: transfers[0].blockNum,
        fromBlock: transfers.at(-1).blockNum
      },
      state: 'completed'
    }
  ];
}

const VITALIK_ADDRESS = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B';
const VITALIK_ADDRESS_UPPER = '0xAB5801A7D398351B8BE11C439E05C5B3259AEC9B';

describe('alchemy', function () {
  this.timeout(20000);
  beforeEach(async () => alchemyRequestsQueue.obliterate());
  this.afterAll(async () => alchemyRequestsQueue.obliterate());

  it('should do no requests if an input is invalid', async () => {
    await rejects(
      api.get('/transactions/v2', { params: { walletAddress: '0xdeadbeef', chainId: 1 } }),
      error => error instanceof AxiosError && error.response?.status === 400
    );
    await rejects(
      api.get('/transactions/v2', {
        params: { walletAddress: VITALIK_ADDRESS, chainId: 0 }
      }),
      error => error instanceof AxiosError && error.response?.status === 400
    );
    await assertJobs([]);
  });

  it('should do exactly one request to API for simultaneous duplicate requests', async () => {
    const requestsParams = [
      { walletAddress: VITALIK_ADDRESS, chainId: 1 },
      { walletAddress: VITALIK_ADDRESS, chainId: '0x1' },
      { walletAddress: VITALIK_ADDRESS.toLowerCase(), chainId: '1' },
      { walletAddress: VITALIK_ADDRESS_UPPER, chainId: '1' }
    ];
    const results = await Promise.all(requestsParams.map(makeHistoryRequest));
    for (let i = 0; i < results.length - 1; i++) {
      deepEqualWithoutUndefined(results[i].data, results[i + 1].data);
    }
    const { transfers } = results[0].data;
    await assertJobs(makeExpectedCompletedJobs(requestsParams[0], transfers));
  });

  it('should do a request to API for each request if they go one-by-one', async function () {
    this.timeout(30000);
    const responses: AxiosResponse[] = [];
    const requestParams = { walletAddress: VITALIK_ADDRESS, chainId: 1 };
    for (let i = 0; i < 2; i++) {
      responses.push(await makeHistoryRequest(requestParams));
    }
    await assertJobs(responses.flatMap(response => makeExpectedCompletedJobs(requestParams, response.data.transfers)));
  });

  it('should do a request to API for each unique request', async () => {
    const requestsParams = [
      { walletAddress: VITALIK_ADDRESS, chainId: 1 },
      { walletAddress: VITALIK_ADDRESS, chainId: 56 },
      { walletAddress: '0x4D85A924B1b137abf7acb9B0c07355a97460637E', chainId: 56 },
      {
        walletAddress: '0x4D85A924B1b137abf7acb9B0c07355a97460637E',
        chainId: 56,
        contractAddress: '0x55d398326f99059ff775485246999027b3197955'
      },
      {
        walletAddress: '0x4D85A924B1b137abf7acb9B0c07355a97460637E',
        chainId: 56,
        olderThanBlockHeight: 41012156
      }
    ];
    const results = await Promise.all(requestsParams.map(makeHistoryRequest));
    await assertJobs(
      requestsParams.map((params, i) => makeExpectedCompletedJobs(params, results[i].data.transfers)).flat()
    );
  });

  it('should respect the limit for CUs per second', async () => {
    const requestsParams = [
      { walletAddress: VITALIK_ADDRESS, chainId: 1 },
      { walletAddress: VITALIK_ADDRESS, chainId: 56 },
      { walletAddress: '0x4D85A924B1b137abf7acb9B0c07355a97460637E', chainId: 56 },
      {
        walletAddress: '0x4D85A924B1b137abf7acb9B0c07355a97460637E',
        chainId: 56,
        contractAddress: '0x55d398326f99059ff775485246999027b3197955'
      },
      {
        walletAddress: '0x4D85A924B1b137abf7acb9B0c07355a97460637E',
        chainId: 56,
        olderThanBlockHeight: 41012156
      }
    ];
    const ptsConsumption: Record<number, number> = {};
    alchemyRequestsQueueEvents.on('progress', async ({ jobId, data }) => {
      if (data === 'getOutput') {
        const job = await alchemyRequestsQueue.getJob(jobId);

        if (!job) {
          return;
        }

        const ts = Date.now();
        ptsConsumption[ts] = (ptsConsumption[ts] ?? 0) + alchemyRequestsCosts[job.name];
      }
    });
    await Promise.all(requestsParams.map(makeHistoryRequest));
    let lastRequestTs = 0;
    let capacityAfterLastRequest = ALCHEMY_CUPS;
    for (const rawTs in ptsConsumption) {
      const ts = Number(rawTs);
      const currentCapacity = Math.min(
        capacityAfterLastRequest + Math.floor((ALCHEMY_CUPS * (ts - lastRequestTs)) / 1000),
        ALCHEMY_CUPS
      );
      const pointsConsumed = ptsConsumption[ts];
      assert(
        pointsConsumed <= currentCapacity,
        `Tried to consume ${pointsConsumed} pts at ${new Date(ts).toISOString()} but only ${currentCapacity} available`
      );
      capacityAfterLastRequest = currentCapacity - pointsConsumed;
      lastRequestTs = ts;
    }
  });
});
