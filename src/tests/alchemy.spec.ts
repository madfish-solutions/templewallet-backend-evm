import assert, { equal, rejects } from 'assert';
import { AxiosResponse } from 'axios';
import { groupBy } from 'lodash';

import {
  AlchemyQueueJobName,
  AlchemyQueueJobsInputs,
  alchemyRequestsCosts,
  alchemyRequestsQueue,
  alchemyRequestsQueueEvents,
  FetchTransactionsResponse
} from '../api-router/alchemy';
import { ALCHEMY_CUPS } from '../config';

import {
  api,
  assertPointsConsumption,
  deepEqualWithoutUndefinedProps,
  isBadRequestError,
  JobSnapshot,
  makeCheckJobsFunction,
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

const makeHistoryRequest = (params: TransactionsHistoryRequestParams) =>
  api.get<FetchTransactionsResponse>('/transactions/v2', { params });

const HUGE_BLOCK_HEIGHT = `0x${(2 ** 256).toString(16)}`;

type WithoutTxReqId<T extends object> = Omit<T, 'txReqId'>;
type ApprovalsJobInput = AlchemyQueueJobsInputs['approvals'];
type AssetTransfersJobInput = AlchemyQueueJobsInputs['assetTransfers'];
type ApprovalsJobSnapshot = JobSnapshot<'approvals', ApprovalsJobInput>;
type ApprovalsWithoutReqIdJobSnapshot = JobSnapshot<'approvals', WithoutTxReqId<ApprovalsJobInput>>;
type AssetTransfersJobSnapshot = JobSnapshot<'assetTransfers', AssetTransfersJobInput>;
type AssetTransfersWithoutReqIdJobSnapshot = JobSnapshot<'assetTransfers', WithoutTxReqId<AssetTransfersJobInput>>;
type AlchemyJobSnapshot = ApprovalsJobSnapshot | AssetTransfersJobSnapshot;
type AlchemyWithoutReqIdJobSnapshot = ApprovalsWithoutReqIdJobSnapshot | AssetTransfersWithoutReqIdJobSnapshot;

const jobsSortPredicate = (a: AlchemyWithoutReqIdJobSnapshot, b: AlchemyWithoutReqIdJobSnapshot) => {
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
};

interface RequestResponseEntry {
  req: TransactionsHistoryRequestParams;
  res: AxiosResponse<FetchTransactionsResponse>;
}

const checkJobs = makeCheckJobsFunction<
  AlchemyQueueJobName,
  ApprovalsJobInput | AssetTransfersJobInput,
  [RequestResponseEntry[]]
>(alchemyRequestsQueue, (allJobs, requestResponseEntries) => {
  const jobsByTxReqId = groupBy(allJobs as AlchemyJobSnapshot[], ({ data }) => data.txReqId);
  const leftRequestResponseEntries = Array.from(requestResponseEntries);
  for (const txReqId in jobsByTxReqId) {
    const allJobsInGroup = jobsByTxReqId[txReqId];
    const completedTransfersJobs = allJobsInGroup
      .filter(job => job.name === 'assetTransfers')
      .filter(({ state }) => state === 'completed')
      .sort(jobsSortPredicate);
    const completedApprovalsJobs = allJobsInGroup
      .filter(job => job.name === 'approvals')
      .filter(({ state }) => state === 'completed')
      .sort(jobsSortPredicate);

    equal(
      completedTransfersJobs.length,
      2,
      `There should be exactly two completed transfers jobs per request, found: ${JSON.stringify(completedTransfersJobs)}`
    );
    const { accAddress, chainId, contractAddress, toBlock } = completedTransfersJobs[0].data;
    const assetTransfersDataBase = {
      chainId: Number(chainId),
      accAddress,
      contractAddress,
      toBlock: toBlock ? Number(toBlock) : undefined
    };
    const completedTransfersJobsWithoutReqID = completedTransfersJobs.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ data: { txReqId, toBlock, ...restData }, ...restProps }) => ({
        ...restProps,
        data: {
          ...restData,
          toBlock: toBlock ? Number(toBlock) : undefined
        }
      })
    );
    deepEqualWithoutUndefinedProps(completedTransfersJobsWithoutReqID, [
      {
        name: 'assetTransfers',
        data: { ...assetTransfersDataBase, toAcc: false },
        state: 'completed'
      },
      {
        name: 'assetTransfers',
        data: { ...assetTransfersDataBase, toAcc: true },
        state: 'completed'
      }
    ]);

    const requestResponseEntryIndex = leftRequestResponseEntries.findIndex(({ req, res }) => {
      const requestMatches =
        req.walletAddress.toLowerCase() === accAddress.toLowerCase() &&
        Number(req.chainId) === chainId &&
        req.contractAddress?.toLowerCase() === contractAddress?.toLowerCase() &&
        (toBlock ? Number(req.olderThanBlockHeight) - 1 === Number(toBlock) : req.olderThanBlockHeight === undefined);

      if (!requestMatches) {
        return false;
      }

      const { transfers } = res.data;

      if (transfers.length === 0) {
        return completedApprovalsJobs.length === 0;
      }

      if (completedApprovalsJobs.length === 0) {
        return transfers.length === 0;
      }

      return (
        Number(transfers[0].blockNum) === Number(completedApprovalsJobs[0].data.toBlock) &&
        Number(transfers.at(-1)!.blockNum) === Number(completedApprovalsJobs.at(-1)!.data.fromBlock)
      );
    });
    assert(requestResponseEntryIndex >= 0, `Failed to find a request for jobs: ${JSON.stringify(allJobsInGroup)}`);

    const { res } = leftRequestResponseEntries[requestResponseEntryIndex];
    leftRequestResponseEntries.splice(requestResponseEntryIndex, 1);
    const { transfers } = res.data;
    if (transfers.length === 0) {
      deepEqualWithoutUndefinedProps(
        completedApprovalsJobs,
        [],
        'There should be no approvals jobs for empty transfers list'
      );
      continue;
    }

    assert(completedApprovalsJobs.length > 0, 'There should be approvals jobs for transfers list');
    assert(completedApprovalsJobs.length <= transfers.length, 'There should be no more approvals jobs than transfers');
    transfers.forEach(transfer => {
      assert(
        completedApprovalsJobs.some(
          ({ data }) =>
            Number(data.fromBlock) <= Number(transfer.blockNum) && Number(data.toBlock) >= Number(transfer.blockNum)
        ),
        `There is no job for approvals around transfer ${JSON.stringify(transfer)}`
      );
    });
  }

  equal(leftRequestResponseEntries.length, 0, 'There should be no requests without jobs');
});

describe('alchemy', function () {
  this.timeout(20000);
  beforeEach(async () => alchemyRequestsQueue.obliterate());
  this.afterAll(async () => alchemyRequestsQueue.obliterate());

  it('should do no requests if an input is invalid', async () => {
    await rejects(makeHistoryRequest({ walletAddress: '0xdeadbeef', chainId: 1 }), isBadRequestError);
    await rejects(makeHistoryRequest({ walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 0 }), isBadRequestError);
    await checkJobs([]);
  });

  it('should do exactly one request for transfers and one batch of requests for approvals to API for simultaneous duplicate requests', async () => {
    const requestsParams = [
      { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 1 },
      { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: '0x1' },
      { walletAddress: TEST_ACCOUNT_ADDRESS.toLowerCase(), chainId: '1' },
      { walletAddress: TEST_ACCOUNT_ADDRESS_UPPER, chainId: '1' }
    ];
    const responses = await Promise.all(requestsParams.map(makeHistoryRequest));
    for (let i = 0; i < responses.length - 1; i++) {
      deepEqualWithoutUndefinedProps(responses[i].data, responses[i + 1].data);
    }
    await checkJobs([{ req: requestsParams[0], res: responses[0] }]);
  });

  it('should do separate requests to API for each request if they go one-by-one', async () => {
    const responses: AxiosResponse<FetchTransactionsResponse>[] = [];
    const requestParams = { walletAddress: TEST_ACCOUNT_ADDRESS, chainId: 1 };
    for (let i = 0; i < 2; i++) {
      responses.push(await makeHistoryRequest(requestParams));
    }
    await checkJobs(responses.map(res => ({ req: requestParams, res })));
  });

  it('should do a request for transfers and a batch of requests for approvals to API for each unique request', async function () {
    this.timeout(5 * 60 * 1000);
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
    const responses = await Promise.all(requestsParams.map(makeHistoryRequest));
    await checkJobs(responses.map((res, i) => ({ req: requestsParams[i], res })));
  });

  it('should respect the limit for CUs per second', async function () {
    this.timeout(5 * 60 * 1000);
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
