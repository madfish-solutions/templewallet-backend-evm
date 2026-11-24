import { ALCHEMY_ATTEMPTS, ALCHEMY_BACKOFF_DELAY, ALCHEMY_CONCURRENCY, ALCHEMY_CUPS } from '../../config.js';
import { createQueuedFetchJobs } from '../../utils/queued-fetch-jobs.js';

import { alchemyRequestsCosts } from './constants.js';
import { getAlchemyResponse } from './responses/index.js';
import { AlchemyQueueJobName, AlchemyQueueJobsInputs, AlchemyQueueJobsOutputs, JobArgs } from './types.js';
import { formatDeduplicationId } from './utils.js';

function getAlchemyJobDeduplicationId(...args: JobArgs<'assetTransfers'>): string;
function getAlchemyJobDeduplicationId(...args: JobArgs<'approvals'>): string;
function getAlchemyJobDeduplicationId(...args: JobArgs<'nftsForOwner'>): string;
function getAlchemyJobDeduplicationId(
  ...args: JobArgs<'assetTransfers'> | JobArgs<'approvals'> | JobArgs<'nftsForOwner'>
): string {
  const [name, data] = args;
  const { chainId, accAddress } = data;

  switch (name) {
    case 'assetTransfers': {
      const { contractAddress, toAcc, toBlock } = data;

      return formatDeduplicationId(0, name, chainId, accAddress, contractAddress, toAcc, toBlock);
    }
    case 'approvals': {
      const { contractAddress, toBlock, fromBlock } = data;

      return formatDeduplicationId(0, name, chainId, accAddress, contractAddress, toBlock, fromBlock);
    }
    default: {
      const { contractAddresses, withMetadata, orderBy, excludeFilters, includeFilters, spamConfidenceLevel, pageKey } =
        data;

      return formatDeduplicationId(
        0,
        name,
        chainId,
        accAddress,
        contractAddresses,
        withMetadata,
        orderBy,
        excludeFilters,
        includeFilters,
        spamConfidenceLevel,
        pageKey
      );
    }
  }
}

const { fetch, queue } = createQueuedFetchJobs<AlchemyQueueJobName, AlchemyQueueJobsInputs, AlchemyQueueJobsOutputs>({
  queueName: 'alchemy-requests',
  costs: alchemyRequestsCosts,
  limitDuration: 1000,
  limitAmount: ALCHEMY_CUPS,
  concurrency: ALCHEMY_CONCURRENCY,
  attempts: ALCHEMY_ATTEMPTS,
  backoffDelay: ALCHEMY_BACKOFF_DELAY,
  getDeduplicationId: getAlchemyJobDeduplicationId,
  getOutput: getAlchemyResponse
});

export { fetch, queue };
