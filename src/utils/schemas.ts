import { isAddress } from '@ethersproject/address';
import { object as objectSchema, string as stringSchema, number as numberSchema } from 'yup';

const addressSchema = stringSchema().test(
  'is-valid-address',
  'Invalid address',
  value => value === undefined || isAddress(value)
);
const naturalNumberSchema = numberSchema().integer().min(1);

export const evmQueryParamsSchema = objectSchema().shape({
  walletAddress: addressSchema.clone().required('walletAddress is undefined'),
  chainId: naturalNumberSchema.clone().required('chainId is undefined')
});

export const evmQueryParamsTransactionsSchema = objectSchema().shape({
  chainId: naturalNumberSchema.clone().required('chainId is undefined'),
  walletAddress: addressSchema.clone().required('walletAddress is undefined'),
  /** Without token ID means ERC-20 tokens only */
  contractAddress: stringSchema().min(1),
  olderThanBlockHeight: naturalNumberSchema
});

const nonEmptyStringSchema = stringSchema().min(1);

export const swapRouteQuerySchema = objectSchema().shape({
  fromChain: nonEmptyStringSchema.clone().required('fromChain is undefined'),
  toChain: nonEmptyStringSchema.clone().required('toChain is undefined'),
  fromToken: nonEmptyStringSchema.clone().required('fromToken is undefined'),
  toToken: nonEmptyStringSchema.clone().required('toToken is undefined'),
  amount: nonEmptyStringSchema.clone().required('amount is undefined'),
  fromAddress: nonEmptyStringSchema.clone().required('fromAddress is undefined'),
  slippage: nonEmptyStringSchema.clone().required('slippage is undefined')
});

export const swapConnectionsQuerySchema = objectSchema().shape({
  fromChain: nonEmptyStringSchema.clone().required('fromChain is undefined'),
  fromToken: nonEmptyStringSchema.clone().required('fromToken is undefined')
});

export const swapTokensQuerySchema = objectSchema().shape({
  chainIds: stringSchema()
    .required('chainIds is required')
    .test(
      'is-valid-chain-ids',
      'At least one chainId is required',
      value => value !== undefined && value.split(',').length > 0
    )
});
