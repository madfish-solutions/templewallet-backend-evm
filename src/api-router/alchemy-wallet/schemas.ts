import { array, lazy, number, object, string, tuple } from 'yup';

const isQuantity = (value: unknown): value is string =>
  typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value) && value.length <= 66;

const address = () =>
  string()
    .matches(/^0x[0-9a-fA-F]{40}$/)
    .required();

const hex = () =>
  string()
    .matches(/^0x(?:[0-9a-fA-F]{2})*$/)
    .required();

const quantity = () =>
  string()
    .matches(/^0x[0-9a-fA-F]+$/)
    .max(66)
    .required();

const callSchema = object({ to: address(), data: hex().max(200_002), value: quantity() }).noUnknown();
const multiplierSchema = object({ multiplier: number().oneOf([0.7, 0.85, 1]).required() }).noUnknown();
const capabilitiesSchema = object({
  eip7702Auth: object({
    delegation: string().oneOf(['ModularAccountV2']).required(),
    version: string().oneOf(['v1.1.0']).required()
  })
    .noUnknown()
    .required(),
  gasParamsOverride: object({
    maxFeePerGas: multiplierSchema.required(),
    maxPriorityFeePerGas: multiplierSchema.required()
  })
    .noUnknown()
    .required()
})
  .noUnknown()
  .test(
    'matching-multipliers',
    'Fee multipliers must match',
    value =>
      value.gasParamsOverride?.maxFeePerGas?.multiplier !== undefined &&
      value.gasParamsOverride.maxFeePerGas.multiplier === value.gasParamsOverride?.maxPriorityFeePerGas?.multiplier
  );
export const prepareSchema = object({
  from: address(),
  chainId: quantity(),
  calls: array(callSchema.required()).min(1).max(32).required(),
  capabilities: capabilitiesSchema.required()
})
  .noUnknown()
  .required();

const signatureSchema = object({ type: string().oneOf(['secp256k1']).required(), data: hex().length(132) }).noUnknown();

export const authorizationSchema = object({
  address: address().test(
    'delegation',
    'Unsupported delegation',
    value => typeof value === 'string' && value.toLowerCase() === '0x77021100bd87b7008e5e1989d0eb38555d0d0000'
  ),
  nonce: quantity().test(
    'safe-nonce',
    'Invalid authorization nonce',
    value => isQuantity(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER)
  )
}).noUnknown();

export const operationSchema = object({
  sender: address(),
  nonce: quantity(),
  callData: hex().max(400_002),
  callGasLimit: quantity(),
  verificationGasLimit: quantity(),
  preVerificationGas: quantity(),
  maxFeePerGas: quantity(),
  maxPriorityFeePerGas: quantity(),
  paymaster: address().optional(),
  paymasterData: hex().optional(),
  paymasterVerificationGasLimit: quantity().optional(),
  paymasterPostOpGasLimit: quantity().optional()
}).noUnknown();

const signedOperationSchema = object({
  type: string().oneOf(['user-operation-v070']).required(),
  chainId: quantity(),
  data: operationSchema.required(),
  signature: signatureSchema.required()
})
  .noUnknown()
  .required();
const signedAuthorizationSchema = object({
  type: string().oneOf(['authorization']).required(),
  chainId: quantity(),
  data: authorizationSchema.required(),
  signature: signatureSchema.required()
}).noUnknown();
const signedTupleSchema = object({
  type: string().oneOf(['array']).required(),
  data: tuple([signedAuthorizationSchema.required(), signedOperationSchema.required()]).required()
})
  .noUnknown()
  .test(
    'same-chain',
    'Authorization and operation chains must match',
    value =>
      isQuantity(value.data?.[0]?.chainId) &&
      isQuantity(value.data?.[1]?.chainId) &&
      BigInt(value.data[0].chainId) === BigInt(value.data[1].chainId)
  );
export const sendSchema = lazy(value => (value?.type === 'array' ? signedTupleSchema : signedOperationSchema));

export const statusSchema = object({ callId: hex().min(4).max(514) }).noUnknown();
