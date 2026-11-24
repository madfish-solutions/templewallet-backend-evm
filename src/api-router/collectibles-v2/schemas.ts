import { NftFilters, NftOrdering } from '@temple-wallet/alchemy-sdk';
import {
  array as arraySchema,
  bool as booleanSchema,
  object as objectSchema,
  StringSchema,
  string as stringSchema
} from 'yup';

import { addressSchema, naturalNumberSchema, nonNegativeNumberStringSchema } from '../../utils/schemas.js';

const openseaCollectiblesByRefsBodySchemaFn = (maxItems: number) =>
  arraySchema(
    objectSchema()
      .shape({
        chainId: naturalNumberSchema.clone().required('chainId is required'),
        contractAddress: addressSchema.clone().required('contractAddress is required'),
        tokenId: nonNegativeNumberStringSchema.clone().required('tokenId is required')
      })
      .required('item is required')
  )
    .min(1)
    .max(maxItems)
    .test('contract-id-collision', 'Pairs of contract address and token ID must be unique', value => {
      if (!value) {
        return true;
      }

      const uniquePairs = new Set(value.map(item => `${item.contractAddress}-${item.tokenId}`));

      return uniquePairs.size === value.length;
    })
    .required();

export const openseaCollectiblesByRefsBodySchema = openseaCollectiblesByRefsBodySchemaFn(30);

export const openseaCachedCollectiblesByRefsBodySchema = openseaCollectiblesByRefsBodySchemaFn(1000);

export const openseaAccountNftsQueryParamsSchema = objectSchema()
  .shape({
    chainId: naturalNumberSchema.clone().required('chainId is undefined'),
    walletAddress: addressSchema.clone().required('walletAddress is undefined'),
    collection: stringSchema(),
    next: stringSchema()
  })
  .required();

const enumSchema = <T extends string>(_enum: Record<string, T>): StringSchema<T | undefined> =>
  stringSchema().oneOf(Object.values(_enum));

const alchemyNftsQuerySchemaTemplate = {
  walletAddress: addressSchema.clone().required('walletAddress is undefined'),
  chainId: naturalNumberSchema.clone().required('chainId is undefined'),
  orderBy: enumSchema(NftOrdering),
  excludeFilters: arraySchema(enumSchema(NftFilters).required()),
  includeFilters: arraySchema(enumSchema(NftFilters).required()),
  spamConfidenceLevel: stringSchema().oneOf(['VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW'] as const),
  pageKey: stringSchema().optional()
};

export const alchemyOwnerContractsQueryParamsSchema = objectSchema().shape(alchemyNftsQuerySchemaTemplate).required();

export const alchemyOwnerNftsQueryParamsSchema = objectSchema()
  .shape({
    ...alchemyNftsQuerySchemaTemplate,
    contractAddresses: arraySchema(addressSchema.clone().required('Should not have nullable values')).min(1).max(45),
    withMetadata: booleanSchema().default(false)
  })
  .required();

export const openseaAccountCollectionsQueryParamsSchema = objectSchema()
  .shape({
    walletAddress: addressSchema.clone().required('walletAddress is undefined'),
    chainIds: arraySchema(naturalNumberSchema.clone().required('Should not have nullable values')).min(1),
    limit: naturalNumberSchema.clone().max(100),
    after: stringSchema()
  })
  .required();

export const openseaSearchQueryParamsSchema = objectSchema().shape({
  query: stringSchema().required('query is undefined'),
  chainIds: arraySchema(naturalNumberSchema.clone().required('Should not have nullable values')).min(1),
  limit: naturalNumberSchema.clone().max(50),
  assetTypes: arraySchema(
    stringSchema()
      .oneOf(['collection', 'nft', 'token', 'account'] as const)
      .required()
  ).min(1)
});
