import axios from 'axios';

import { EnvVars } from '../config';
import { CodedError } from '../utils/errors';

const alchemyWalletApi = axios.create({
  baseURL: `https://api.g.alchemy.com/v2/${EnvVars.ALCHEMY_API_KEY}`
});

interface WalletPrepareCallsRequestBody {
  chainId: string;
  paymasterService?: boolean;
  capabilities?: unknown;
  [key: string]: unknown;
}

const chainIdTokenAddressRecord: Record<string, string> = {
  '0x66eee': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // Arbitrum Sepolia USDC
  '0x13882': '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // Polygon Amoy USDC
  '0xaa36a7': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' // Ethereum Sepolia USDC
};

const getPaymasterServiceCapabilities = (chainId: string) => {
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
  const { paymasterService, chainId } = parsedBody;

  if (paymasterService !== undefined && typeof paymasterService !== 'boolean') {
    throw new CodedError(400, 'paymasterService must be a boolean');
  }

  if (chainId === undefined || typeof chainId !== 'string' || chainId.length === 0) {
    throw new CodedError(400, 'chainId must be a non-empty string');
  }

  return {
    ...parsedBody,
    chainId,
    paymasterService: paymasterService as boolean | undefined
  };
}

export const getWalletPrepareCallsRateLimitKey = (body: unknown): string | undefined => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }

  const from = (body as Record<string, unknown>).from;

  return typeof from === 'string' ? from : undefined;
};

export async function proxyWalletPrepareCalls(body: unknown) {
  const { paymasterService, chainId, ...requestParams } = parseWalletPrepareCallsBody(body);
  const requestParamsWithoutCapabilities = Object.fromEntries(
    Object.entries({ chainId, ...requestParams }).filter(([key]) => key !== 'capabilities')
  );

  const payload = {
    id: 1,
    jsonrpc: '2.0',
    method: 'wallet_prepareCalls',
    params: [
      {
        ...requestParamsWithoutCapabilities,
        ...(paymasterService ? { capabilities: getPaymasterServiceCapabilities(chainId) } : {})
      }
    ]
  };

  const { data } = await alchemyWalletApi.post('', payload);

  return data;
}
