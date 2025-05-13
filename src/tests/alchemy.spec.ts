import { rejects } from 'assert';
import { AxiosResponse } from 'axios';

import {
  AlchemyQueueJobsInputs,
  alchemyRequestsCosts,
  alchemyRequestsQueue,
  alchemyRequestsQueueEvents
} from '../api-router/alchemy';
import { ALCHEMY_CUPS } from '../config';

import {
  api,
  assertPointsConsumption,
  deepEqualWithoutUndefined,
  isBadRequestError,
  JobSnapshot,
  makeAssertJobsFunction,
  TEST_ACCOUNT_ADDRESS,
  TEST_ACCOUNT_ADDRESS_UPPER,
  VITALIK_ADDRESS,
  withQueueEventsListening
} from './utils';

interface TransactionsHistoryRequestParams {
  walletAddress: string;
  chainId: number | string;
  contractAddress?: string;
  olderThanBlockHeight?: string | number;
}

const makeHistoryRequest = (params: TransactionsHistoryRequestParams) => api.get('/transactions/v2', { params });

const HUGE_BLOCK_HEIGHT = `0x${(2 ** 256).toString(16)}`;

type ApprovalsJobSnapshot = JobSnapshot<'approvals', AlchemyQueueJobsInputs['approvals']>;
type AssetTransfersJobSnapshot = JobSnapshot<'assetTransfers', AlchemyQueueJobsInputs['assetTransfers']>;
type AlchemyJobSnapshot = ApprovalsJobSnapshot | AssetTransfersJobSnapshot;

const assertJobs = makeAssertJobsFunction(alchemyRequestsQueue, (a, b) => {
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
    const { toAcc: aToAcc } = (a as AssetTransfersJobSnapshot).data;
    const { toAcc: bToAcc } = (b as AssetTransfersJobSnapshot).data;

    return Number(aToAcc) - Number(bToAcc);
  }

  return 0;
});

const makeExpectedCompletedJobs = (
  { walletAddress: accAddress, chainId, contractAddress, olderThanBlockHeight }: TransactionsHistoryRequestParams,
  transfers: any[]
): AlchemyJobSnapshot[] => {
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
};

describe('alchemy', function () {
  this.timeout(20000);
  beforeEach(async () => alchemyRequestsQueue.obliterate());
  this.afterAll(async () => alchemyRequestsQueue.obliterate());

  it('should do no requests if an input is invalid', async () => {
    await rejects(makeHistoryRequest({ walletAddress: '0xdeadbeef', chainId: 1 }), isBadRequestError);
    await rejects(makeHistoryRequest({ walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 0 }), isBadRequestError);
    await assertJobs([]);
  });

  it('should do exactly one request to API for simultaneous duplicate requests', async () => {
    const requestsParams = [
      { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 1 },
      { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: '0x1' },
      { walletAddress: TEST_ACCOUNT_ADDRESS.toLowerCase(), chainId: '1' },
      { walletAddress: TEST_ACCOUNT_ADDRESS_UPPER, chainId: '1' }
    ];
    const results = await Promise.all(requestsParams.map(makeHistoryRequest));
    for (let i = 0; i < results.length - 1; i++) {
      deepEqualWithoutUndefined(results[i].data, results[i + 1].data);
    }
    const { transfers } = results[0].data;
    await assertJobs(makeExpectedCompletedJobs(requestsParams[0], transfers));
  });

  it('should do a request to API for each request if they go one-by-one', async () => {
    const responses: AxiosResponse[] = [];
    const requestParams = { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 1 };
    for (let i = 0; i < 2; i++) {
      responses.push(await makeHistoryRequest(requestParams));
    }
    await assertJobs(responses.flatMap(response => makeExpectedCompletedJobs(requestParams, response.data.transfers)));
  });

  it('should do a request to API for each unique request', async () => {
    const requestsParams = [
      { walletAddress: VITALIK_ADDRESS, chainId: 1 },
      { walletAddress: VITALIK_ADDRESS, chainId: 56 },
      { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 56 },
      {
        walletAddress: TEST_ACCOUNT_ADDRESS,
        chainId: 56,
        contractAddress: '0x55d398326f99059ff775485246999027b3197955'
      },
      { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 56, olderThanBlockHeight: 41012156 }
    ];
    const results = await Promise.all(requestsParams.map(makeHistoryRequest));
    await assertJobs(
      requestsParams.map((params, i) => makeExpectedCompletedJobs(params, results[i].data.transfers)).flat()
    );
  });

  it('should respect the limit for CUs per second', async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const requestsParams = [
      { walletAddress: VITALIK_ADDRESS, chainId: 1 },
      { walletAddress: VITALIK_ADDRESS, chainId: 56 },
      { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 56 },
      {
        walletAddress: TEST_ACCOUNT_ADDRESS,
        chainId: 56,
        contractAddress: '0x55d398326f99059ff775485246999027b3197955'
      },
      { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 56, olderThanBlockHeight: 41012156 }
    ];
    const { ptsConsumption } = await withQueueEventsListening(
      alchemyRequestsQueueEvents,
      () => Promise.allSettled(requestsParams.map(makeHistoryRequest)),
      alchemyRequestsQueue,
      alchemyRequestsCosts
    );
    assertPointsConsumption(ptsConsumption, ALCHEMY_CUPS);
  });
});
