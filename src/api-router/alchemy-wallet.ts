import axios from 'axios';

import { EnvVars } from '../config';
import { CodedError } from '../utils/errors';

const alchemyWalletApi = axios.create({
  baseURL: `https://api.g.alchemy.com/v2/${EnvVars.ALCHEMY_API_KEY}`
});

interface WalletPrepareCallsRequestBody {
  chainId: string;
  paymasterService?: boolean;
  onlyEstimation?: boolean;
  capabilities?: unknown;
  [key: string]: unknown;
}

interface WalletSendPreparedCallsRequestBody {
  chainId: string;
  data: {
    sender?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const chainIdTokenAddressRecord: Record<string, string> = {
  '0x66eee': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // Arbitrum Sepolia USDC
  '0x13882': '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // Polygon Amoy USDC
  '0xaa36a7': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' // Ethereum Sepolia USDC
};

const getPaymasterServiceCapabilities = (chainId: string, onlyEstimation?: boolean) => {
  if (!EnvVars.ALCHEMY_POLICY_ID) {
    throw new CodedError(500, 'ALCHEMY_POLICY_ID is not configured');
  }

  if (onlyEstimation === true) {
    return {
      paymasterService: {
        policyId: EnvVars.ALCHEMY_POLICY_ID,
        onlyEstimation
      }
    };
  }

  const tokenAddress = chainIdTokenAddressRecord[chainId];

  if (!tokenAddress) {
    throw new CodedError(400, 'Unsupported chainId for paymasterService');
  }

  return {
    paymasterService: {
      policyId: EnvVars.ALCHEMY_POLICY_ID,
      erc20: {
        tokenAddress,
        postOpSettings: {
          autoApprove: true
        }
      }
    }
  };
};

function parseWalletPrepareCallsBody(body: unknown): WalletPrepareCallsRequestBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CodedError(400, 'Body must be a JSON object');
  }

  const parsedBody = body as Record<string, unknown>;
  const { paymasterService, onlyEstimation, chainId } = parsedBody;

  if (paymasterService !== undefined && typeof paymasterService !== 'boolean') {
    throw new CodedError(400, 'paymasterService must be a boolean');
  }

  if (onlyEstimation !== undefined && typeof onlyEstimation !== 'boolean') {
    throw new CodedError(400, 'onlyEstimation must be a boolean');
  }

  if (chainId === undefined || typeof chainId !== 'string' || chainId.length === 0) {
    throw new CodedError(400, 'chainId must be a non-empty string');
  }

  return {
    ...parsedBody,
    chainId,
    paymasterService: paymasterService,
    onlyEstimation
  };
}

function parseWalletSendPreparedCallsBody(body: unknown): WalletSendPreparedCallsRequestBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CodedError(400, 'Body must be a JSON object');
  }

  const parsedBody = body as Record<string, unknown>;
  const { chainId, data } = parsedBody;

  if (chainId === undefined || typeof chainId !== 'string' || chainId.length === 0) {
    throw new CodedError(400, 'chainId must be a non-empty string');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new CodedError(400, 'data must be an object');
  }

  return {
    ...parsedBody,
    chainId,
    data: data as WalletSendPreparedCallsRequestBody['data']
  };
}

function parseWalletGetCallsStatusBody(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CodedError(400, 'Body must be a JSON object');
  }

  const callId = (body as Record<string, unknown>).callId;

  if (typeof callId !== 'string' || !callId.startsWith('0x')) {
    throw new CodedError(400, 'callId must be a hex string');
  }

  return callId;
}

async function callAlchemyWalletMethod(method: string, params: unknown[]) {
  const payload = {
    id: 1,
    jsonrpc: '2.0',
    method,
    params
  };

  const { data } = await alchemyWalletApi.post('', payload);

  return data;
}

export const getAlchemyWalletRateLimitKey = (body: unknown): string | undefined => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }

  const typedBody = body as Record<string, unknown>;
  const from = typedBody.from;

  if (typeof from === 'string') {
    return from;
  }

  const data = typedBody.data;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }

  const sender = (data as Record<string, unknown>).sender;

  return typeof sender === 'string' ? sender : undefined;
};

export async function proxyWalletPrepareCalls(body: unknown) {
  const { paymasterService, onlyEstimation, chainId, ...requestParams } = parseWalletPrepareCallsBody(body);
  const requestParamsWithoutCapabilities = Object.fromEntries(
    Object.entries({ chainId, ...requestParams }).filter(([key]) => key !== 'capabilities')
  );

  return callAlchemyWalletMethod('wallet_prepareCalls', [
    {
      ...requestParamsWithoutCapabilities,
      ...(paymasterService ? { capabilities: getPaymasterServiceCapabilities(chainId, onlyEstimation) } : {})
    }
  ]);
}

export async function proxyWalletSendPreparedCalls(body: unknown) {
  const requestParams = parseWalletSendPreparedCallsBody(body);

  return callAlchemyWalletMethod('wallet_sendPreparedCalls', [requestParams]);
}

export async function proxyWalletGetCallsStatus(body: unknown) {
  const callId = parseWalletGetCallsStatusBody(body);

  return callAlchemyWalletMethod('wallet_getCallsStatus', [callId]);
}
