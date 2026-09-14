import { array, number, object, string } from 'yup';

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
const multiplierSchema = object({ multiplier: number().required() }).noUnknown();
const capabilitiesSchema = object({
  gasParamsOverride: object({
    maxFeePerGas: multiplierSchema.required(),
    maxPriorityFeePerGas: multiplierSchema.required()
  })
    .noUnknown()
    .required()
}).noUnknown();
export const prepareSchema = object({
  from: address(),
  chainId: quantity(),
  calls: array(callSchema).min(1).max(32).required(),
  capabilities: capabilitiesSchema.required()
}).noUnknown();

const signatureSchema = object({ type: string().oneOf(['secp256k1']).required(), data: hex().length(132) }).noUnknown();

export const authorizationSchema = object({ address: address(), nonce: quantity() }).noUnknown();

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

export const signedItemSchema = object({
  type: string().oneOf(['authorization', 'user-operation-v070']).required(),
  chainId: quantity(),
  data: object().required(),
  signature: signatureSchema.required()
}).noUnknown();

export const sendSchema = object({ type: string().oneOf(['array', 'user-operation-v070']).required() });

export const statusSchema = object({ callId: hex().min(4).max(514) }).noUnknown();
