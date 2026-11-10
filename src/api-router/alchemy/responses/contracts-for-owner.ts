import { AlchemyQueueJobsInputs } from '../types.js';
import { getAlchemyClient } from '../utils.js';

export const getContractsForOwnerResponse = async (data: AlchemyQueueJobsInputs['contractsForOwner']) => {
  const { chainId, accAddress, ...options } = data;
  const alchemy = getAlchemyClient(chainId);

  return await alchemy.nft.getContractsForOwner(accAddress, options);
};
