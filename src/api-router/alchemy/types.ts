import {
  AssetTransfersWithMetadataResult,
  GetContractsForOwnerResponse,
  Log,
  NftFilters,
  NftOrdering,
  OwnedBaseNftsResponse,
  OwnedNftsResponse
} from '@temple-wallet/alchemy-sdk';

export type AlchemyQueueJobName = 'assetTransfers' | 'approvals' | 'nftsForOwner' | 'contractsForOwner';

export interface AlchemyQueueJobsInputs {
  assetTransfers: {
    /** Only for testing and debugging */
    txReqId: string;
    chainId: number;
    accAddress: string;
    contractAddress?: string;
    toAcc: boolean;
    toBlock?: string;
  };
  approvals: {
    /** Only for testing and debugging */
    txReqId: string;
    chainId: number;
    accAddress: string;
    contractAddress?: string;
    toBlock: string;
    fromBlock: string;
  };
  nftsForOwner: {
    /** Only for testing and debugging */
    nftsReqId: string;
    accAddress: string;
    chainId: number;
    contractAddresses?: string[];
    withMetadata?: boolean;
    orderBy?: NftOrdering;
    excludeFilters?: Array<NftFilters>;
    includeFilters?: Array<NftFilters>;
    spamConfidenceLevel?: 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
    pageKey?: string;
  };
  contractsForOwner: {
    /** Only for testing and debugging */
    nftsReqId: string;
    accAddress: string;
    chainId: number;
    orderBy?: NftOrdering;
    excludeFilters?: Array<NftFilters>;
    includeFilters?: Array<NftFilters>;
    spamConfidenceLevel?: 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
    pageKey?: string;
  };
}

export type SomeNftsResponse = OwnedBaseNftsResponse | OwnedNftsResponse;

export interface AlchemyQueueJobsOutputs {
  assetTransfers: AssetTransfersWithMetadataResult[];
  approvals: Log[];
  nftsForOwner: SomeNftsResponse;
  contractsForOwner: GetContractsForOwnerResponse;
}

export interface FetchTransactionsResponse {
  transfers: AssetTransfersWithMetadataResult[];
  approvals: Log[];
}

export type JobArgs<T extends AlchemyQueueJobName> = [name: T, data: AlchemyQueueJobsInputs[T]];
