import { Log } from '@temple-wallet/alchemy-sdk';

import { CodedError } from '../../../utils/errors.js';
import { BLOCK_RANGE_ERROR_REGEX } from '../constants.js';
import { AlchemyQueueJobsInputs } from '../types.js';
import { getAlchemyClient } from '../utils.js';

export const getApprovalsResponse = async (data: AlchemyQueueJobsInputs['approvals']): Promise<Log[]> => {
  const { chainId, contractAddress, accAddress, toBlock, fromBlock } = data;
  const alchemy = getAlchemyClient(chainId);
  try {
    return await alchemy.core.getLogs({
      address: contractAddress,
      topics: [
        [
          '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925', // Approval
          '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31' // ApprovalForAll
        ],
        `0x${accAddress.slice(2).padStart(64, '0')}`
      ],
      toBlock,
      fromBlock
    });
  } catch (e: any) {
    if (e?.error?.code === -32602) return [];

    if (e?.message?.match(BLOCK_RANGE_ERROR_REGEX)) {
      throw new CodedError(400, e.message);
    }

    throw e;
  }
};
