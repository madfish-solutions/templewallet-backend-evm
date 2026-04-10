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
  type?: string;
  chainId?: string;
  data: unknown[] | Record<string, unknown>;
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

  const tokenAddress = chainIdTokenAddressRecord[chainId];

  if (!tokenAddress) {
    throw new CodedError(400, 'Unsupported chainId for paymasterService');
  }

  return {
    paymasterService: {
      policyId: EnvVars.ALCHEMY_POLICY_ID,
      onlyEstimation,
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
  const { chainId, data, type } = parsedBody;

  if (chainId !== undefined && (typeof chainId !== 'string' || chainId.length === 0)) {
    throw new CodedError(400, 'chainId must be a non-empty string');
  }

  if (type !== undefined && (typeof type !== 'string' || type.length === 0)) {
    throw new CodedError(400, 'type must be a non-empty string');
  }

  if (!data || typeof data !== 'object') {
    throw new CodedError(400, 'data must be an object or array');
  }

  if (Array.isArray(data) && data.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new CodedError(400, 'data array items must be objects');
  }

  return {
    ...parsedBody,
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

  if (!data || typeof data !== 'object') {
    return undefined;
  }

  if (!Array.isArray(data)) {
    const sender = (data as Record<string, unknown>).sender;

    return typeof sender === 'string' ? sender : undefined;
  }

  const userOperationItem = data.find(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false;
    }

    const nestedData = (item as Record<string, unknown>).data;
    if (!nestedData || typeof nestedData !== 'object' || Array.isArray(nestedData)) {
      return false;
    }

    return typeof (nestedData as Record<string, unknown>).sender === 'string';
  });

  if (!userOperationItem || typeof userOperationItem !== 'object' || Array.isArray(userOperationItem)) {
    const authorizationItem = data.find(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return false;
      }

      const nestedData = (item as Record<string, unknown>).data;
      if (!nestedData || typeof nestedData !== 'object' || Array.isArray(nestedData)) {
        return false;
      }

      return typeof (nestedData as Record<string, unknown>).address === 'string';
    });

    if (!authorizationItem || typeof authorizationItem !== 'object' || Array.isArray(authorizationItem)) {
      return undefined;
    }

    const nestedAuthorizationData = (authorizationItem as Record<string, unknown>).data as Record<string, unknown>;
    const address = nestedAuthorizationData.address;

    return typeof address === 'string' ? address : undefined;
  }

  const nestedData = (userOperationItem as Record<string, unknown>).data as Record<string, unknown>;
  const sender = nestedData.sender;

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
