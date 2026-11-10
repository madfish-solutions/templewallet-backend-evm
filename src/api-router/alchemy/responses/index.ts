import { AssetTransfersWithMetadataResult, GetContractsForOwnerResponse, Log } from '@temple-wallet/alchemy-sdk';

import { JobArgs, SomeNftsResponse } from '../types.js';

import { getApprovalsResponse } from './approvals.js';
import { getAssetTransfersResponse } from './asset-transfers.js';
import { getContractsForOwnerResponse } from './contracts-for-owner.js';
import { getNftsForOwnerResponse } from './nfts-for-owner.js';

export async function getAlchemyResponse(
  ...args: JobArgs<'assetTransfers'>
): Promise<AssetTransfersWithMetadataResult[]>;
export async function getAlchemyResponse(...args: JobArgs<'approvals'>): Promise<Log[]>;
export async function getAlchemyResponse(...args: JobArgs<'nftsForOwner'>): Promise<SomeNftsResponse>;
export async function getAlchemyResponse(...args: JobArgs<'contractsForOwner'>): Promise<GetContractsForOwnerResponse>;
export async function getAlchemyResponse(
  ...args: JobArgs<'assetTransfers'> | JobArgs<'approvals'> | JobArgs<'nftsForOwner'> | JobArgs<'contractsForOwner'>
): Promise<AssetTransfersWithMetadataResult[] | Log[] | SomeNftsResponse | GetContractsForOwnerResponse> {
  const [name, data] = args;

  switch (name) {
    case 'assetTransfers':
      return await getAssetTransfersResponse(data);
    case 'approvals':
      return await getApprovalsResponse(data);
    case 'contractsForOwner':
      return await getContractsForOwnerResponse(data);
    default:
      return await getNftsForOwnerResponse(data);
  }
}
