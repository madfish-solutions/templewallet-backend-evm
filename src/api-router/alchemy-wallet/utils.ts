import axios from 'axios';

import { EnvVars } from '../../config';
import { CodedError } from '../../utils/errors';

import { SUPPORTED_CHAINS } from './config';

export async function rpc(method: string, param: unknown): Promise<unknown> {
  try {
    const { data } = await axios.post(
      `https://api.g.alchemy.com/v2/${EnvVars.ALCHEMY_API_KEY}`,
      {
        jsonrpc: '2.0',
        id: 1,
        method,
        params: [param]
      },
      { timeout: 25_000, maxContentLength: 1_000_000 }
    );
    // Return JSON-RPC errors for the existing confirmation error UI.

    if (data?.error) {
      return {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: Number.isInteger(data.error.code) ? data.error.code : -32603,
          message: redactCredentials(String(data.error.message ?? 'Alchemy request failed')),
          ...(data.error.data === undefined
            ? {}
            : { data: JSON.parse(redactCredentials(JSON.stringify(data.error.data))) })
        }
      };
    }

    return data;
  } catch (error) {
    // Axios errors contain the credential-bearing URL. Do not pass them to the logger.
    if (
      method === 'wallet_sendPreparedCalls' &&
      axios.isAxiosError(error) &&
      (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
    ) {
      return {
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32098, message: 'Alchemy submission response timed out' }
      };
    }
    if (method === 'wallet_sendPreparedCalls' && axios.isAxiosError(error) && error.code === 'ERR_NETWORK') {
      return {
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32098, message: 'Alchemy submission response unavailable' }
      };
    }
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      return { jsonrpc: '2.0', id: 1, error: { code: 429, message: 'Alchemy rate limit reached. Retry later.' } };
    }

    return { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Alchemy is unavailable. Retry the operation.' } };
  }
}

export const getSubmissionSender = (body: unknown): string | undefined => {
  if (!body || typeof body !== 'object') return;
  const value = body as { type?: unknown; data?: unknown };
  const items = value.type === 'array' && Array.isArray(value.data) ? value.data : [value];
  const operation = items.find((item): item is { type: string; data: { sender?: unknown } } =>
    Boolean(item && typeof item === 'object' && (item as { type?: unknown }).type === 'user-operation-v070')
  );
  const sender = operation?.data?.sender;

  return typeof sender === 'string' ? sender.toLowerCase() : undefined;
};

export function assertChain(chainId: string): void {
  if (!SUPPORTED_CHAINS.includes(Number(BigInt(chainId)))) throw new CodedError(400, 'Alchemy batch chain is disabled');
}

function redactCredentials(value: string): string {
  const sanitized = EnvVars.ALCHEMY_API_KEY ? value.split(EnvVars.ALCHEMY_API_KEY).join('[redacted]') : value;

  return sanitized.replace(/https?:[^\s"\\]*alchemy\.com\/v2\/[^\s"\\]*/gi, '[Alchemy URL]');
}
