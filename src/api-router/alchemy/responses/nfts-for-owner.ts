import { AlchemyQueueJobsInputs, SomeNftsResponse } from '../types.js';
import { getAlchemyClient } from '../utils.js';

export const getNftsForOwnerResponse = async (
  data: AlchemyQueueJobsInputs['nftsForOwner']
): Promise<SomeNftsResponse> => {
  const { chainId, accAddress, withMetadata, ...commonOptions } = data;
  const alchemy = getAlchemyClient(chainId);
  const options = withMetadata === false ? { ...commonOptions, omitMetadata: true } : commonOptions;

  return await alchemy.nft.getNftsForOwner(accAddress, options);
};
