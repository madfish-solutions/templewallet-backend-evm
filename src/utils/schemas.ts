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
